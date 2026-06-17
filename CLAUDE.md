# CLAUDE.md — Centering Work Manager

> Context for future Claude Code sessions. Read this before making changes so the
> deliberate design choices below aren't accidentally undone. **Keep this file
> updated whenever a significant change is made.**

## What this is

A mobile-first, offline-first PWA for a **sole centering / shuttering contractor**
("Meistri") who runs 2–3 small-building sites at once with non-permanent workers. It
tracks **buildings → molds (floors) → work (attendance)**, **workers** and their pay,
**owners** and what they owe, and reads money in/out from the contractor's *separate*
personal-finance transaction app to show **profit per building** and **what they're owed**.
Single user, no accounts, all data on-device.

## Stack & architecture

- **React + Vite + TypeScript**, **Tailwind** + a hand-rolled **shadcn/ui-style** kit
  (Radix primitives in `src/components/ui/`).
- **Dexie.js / IndexedDB** — all data local. No backend, no server.
- **PWA** via `vite-plugin-pwa` (installable + offline). Also packaged as an **Android APK**
  via **Capacitor** in CI.
- Pure business logic lives in `src/lib/compute/` and is **unit-testable** (no React/Dexie).
  Screens load data with Dexie `useLiveQuery` hooks (`src/lib/hooks.ts`) and pass arrays into
  those pure functions. Writes go through `src/lib/repo.ts` (consistent ids/timestamps/codes).

**This is a separate app from the transaction app.** It must **never modify** the transaction
app. It only **reads** that app's exported encrypted backup, **one-way**, via a **file picker**
(v1). The decrypt happens in memory; only `Construction` transactions are persisted here.

### Key files
```
src/lib/
  db.ts          Dexie schema + seed (settings, otherExpenseTypes)
  types.ts       domain types
  crypto.ts      AES-256-GCM / PBKDF2-SHA256 (200k) + decryptFlexible()  ← txn-app interop point
  sync.ts        read txn backup → extractConstruction() → upsert by UUID
  backup.ts      this app's own encrypted backup / restore (cwm-backup-v1)
  repo.ts        create/update helpers + quick-create (for combobox add-new)
  hooks.ts       Dexie useLiveQuery hooks
  select.ts      shared selectors (byId, groupBy, computeBuilding, currentMold)
  env.ts         defensive VITE_* access (v2 Google Drive only)
  compute/       shifts.ts · food.ts · balance.ts · profit.ts · weekly.ts
src/components/  UI kit + shell (AppShell, BottomNav, PageHeader, FormScaffold, …)
src/screens/     Dashboard, buildings/, molds/, workers/, owners/, attendance/, payments/, Weekly, More, Settings
```

## Data model (Dexie, all keyed on UUID `id`)

- **buildings** — `id, code, name, ownerId?, location?, startDate?, endDate?, ratePerSqft?, status, photoThumb?, notes?`
- **molds** (one mold = one floor; plinth/sump/lift/steps roll into that floor) — `id, buildingId, floorName, order, startDate?, endDate?, sqft?, billAmount?, billPdfLink?, workStatus, paymentStatus, notes?`
- **workers** — `id, code, name, type(Helper|Carpenter|Outsider), dailyWage, phone?, active, photoThumb?, foodMode, foodBreakfast, foodLunch, foodPerDay?, foodPerWeek?, maxDaysPerWeek, notes?`
- **owners** — `id, code, name, phone?, location?, photoThumb?, notes?`
- **attendance** (= "work done") — `id, workerId, buildingId, moldId?, date, shiftFrom?, shiftTo?, blocks[], dayFraction, notes?`
- **syncedTransactions** (snapshot + assignment of a Construction txn) — `id (the txn UUID), date, amount, direction, subCategory, description?, lastSeenAmount, assignmentStatus(unassigned|assigned|needsReview), buildingId?, moldId?, workerId?, materialDescription?, otherExpenseType?`
- **otherExpenseTypes** — `id, name` (seeded `FinanceCost`, `Theft`)
- **settings** (single row `id:'app'`) — shift blocks, default food, `collectAlertDays`, `weekStartsOn`, `appLock`

## Core business logic

**Shifts → dayFraction** (`compute/shifts.ts`): 3 configurable blocks (default 06:00–09:00,
09:30–13:00, 14:00–18:00), each = 0.5 day. A from–to time auto-maps to blocks (≥50% overlap);
blocks are also toggled manually. `dayFraction = 0.5 × blocks worked, capped at 1.5` (3rd block
is OT at **normal** rate). **Meals:** breakfast if block 1 worked, lunch if block 3 (block 2
alone = no meal).

**Food (calculated, `compute/food.ts`)** — three modes:
- `meal`: breakfast/lunch amounts per the meal flags above.
- `fixedPerDay`: `foodPerDay × dayFraction`.
- `fixedPerWeek`: per ISO-week, `foodPerWeek × (Σ dayFraction that week / maxDaysPerWeek)`.

**Two separate money layers (DO NOT merge them):**

- **Worker balance — cash settlement** (`compute/balance.ts`):
  `owed = wage (Σ dayFraction × dailyWage) + calculated food`;
  `paid = Σ assigned txns with subCategory ∈ {Wage, Advance, Food}`;
  `balance = owed − paid` (>0 ⇒ you owe the worker). **Transport & Rent assigned to a worker do
  NOT affect the balance** — they're provisions → overhead.
- **Profit — accrual / cost-based** (`compute/profit.ts`):
  per building `margin = OwnerReceipts − attendance labour` (labour from **attendance**, never
  from wage payments); business-wide `overhead = calculated food + Transport + Rent + Material +
  OtherExpense`; `total profit = Σ building margins − overhead`.

**No-double-count rules (load-bearing — keep them true):**
1. **Food is counted once**, as a *calculated* cost in overhead. A `Food` *transaction* only
   reduces the worker's balance (cash given); it is never re-added as a cost.
2. **Building labour comes from attendance**, not from `Wage` transactions.
3. **Wage/Advance/Food transactions are cash settlement** (balance only), never re-added as cost.

`compute/weekly.ts` builds the payroll register: per worker per Mon–Sun day-fractions, totals,
wage, food, paid (txns dated that week), current, previous balance (cumulative before the week),
final balance. Cumulative lifetime balance is the source of truth; weekly buckets use the
transaction date for "paid".

## Transaction integration convention

- The txn app writes `category = "Construction"` + a short `subCategory`
  (`OwnerReceipt, Wage, Advance, Food, Transport, Rent, Material, OtherExpense`).
- **Sync** (`sync.ts`): decrypt the txn backup in memory → keep `Construction` → **upsert by
  `id` (UUID), NEVER `slNo`** (slNo re-sequences on backdated inserts). New `id` → `unassigned`.
  Existing `id` whose `amount !== lastSeenAmount` → **`needsReview`** (keeps the prior
  assignment, flags it); `lastSeenAmount` is always updated.
- **Review queue** = `unassigned` + `needsReview`. Assignment fields are chosen **by
  subCategory** (`SUBCATEGORY_FIELDS` in `constants.ts`): OwnerReceipt→building(+mold);
  Wage/Advance/Food/Transport/Rent→worker; Material→free-text; OtherExpense→type (add-new).
  All entity pickers are autocomplete + **add-new-by-typing** (the `Combobox`).
- **⚠️ The one interop point:** `crypto.ts → decryptFlexible()` plus the `*_KEYS` lists in
  `sync.ts`. They auto-detect common envelope/field shapes; this was built **without a real
  sample export**, so verify against one and adjust `CRYPTO_FIELD_NAMES` / `PACKED_LAYOUT` /
  `*_KEYS` if a real file fails. Backups use the same crypto scheme (AES-256-GCM / PBKDF2-SHA256
  / 200k).

## Statuses & dashboard

- **Building:** `Yet to Start, In Progress, On Hold, Completed, Closed`
  (Completed = work done; **Closed = work done AND fully paid**).
- **Mold work:** `Not Started, In Progress, Done/Removed`. **Mold payment:** `Not Billed, Billed,
  Partly Paid, Paid`.
- **Dashboard** (`screens/Dashboard.tsx`): operational top first — active buildings (current mold
  + statuses, running margin, "unpaid ₹X" badge), a **Go-collect** list (Done/Removed & not Paid
  past `collectAlertDays`, default 18, with aging), and a "transactions to assign: N" nudge — then
  the **money** section: total profit after overhead, receivables, money owed to workers, this
  week's wages, overhead this month, profit by building. Closed buildings are hidden from the
  operational top.

## Deployment

- **Web (Vercel):** import the repo (Vite preset auto-detected); push to `main` → auto-build &
  deploy. `vercel.json` adds the SPA fallback rewrite so client routes survive a refresh.
- **Android APK (Capacitor + GitHub Actions):** `.github/workflows/build-apk.yml` on push to
  `main`, on `v*` tags, and manual dispatch — Node 20 / JDK 17 / Android SDK → `npm install`
  (never `npm ci`; no lockfile committed) → `npm run build` → `npx cap add android` (the
  `android/` folder is **not** committed) → `scripts/patch-android.sh` (idempotent: SDK versions,
  INTERNET permission) → `npx cap sync android` → `./gradlew assembleDebug` → upload artifact
  **`centering-debug-apk`**; on `v*` tags also attach the APK to a GitHub Release.
  `capacitor.config.ts`: appId `app.centering.manager`, appName "Centering Work Manager",
  webDir `dist`.
- **Env vars** (`VITE_GOOGLE_CLIENT_ID`, `VITE_OAUTH_REDIRECT_URL`) are **v2-only** (Google Drive
  auto-fetch). Vercel project settings (Sensitive = OFF — `VITE_*` ships in the client bundle)
  and GH Actions secrets. v1 must build/deploy fine without them — read them defensively via
  `src/lib/env.ts`.

## Why (deliberate decisions — don't undo)

- **Separate apps:** keeps the transaction app clean and single-purpose; this app is read-only
  toward it. No shared DB, no coupling beyond the backup file format.
- **UUID `id`, never `slNo`:** `slNo` deliberately re-sequences when a backdated txn is inserted,
  so it's not stable. UUIDs survive re-import and a future cloud merge, and let amount-change
  re-flagging work.
- **Overhead as a separate business-wide bucket** (not per-building): food/transport/rent/
  material/other aren't cleanly attributable to one building; lumping them per-building would
  distort per-building margins.
- **Food calculated, not transactional:** food is derived from attendance + per-worker config so
  it's consistent everywhere (weekly register and overhead) and never double-counted with any
  `Food` cash payment.
- **File picker before Drive:** ships a working v1 with zero OAuth/secrets; Drive auto-fetch is a
  v2 add-on, not a v1 dependency.

## Known limitations & v2 roadmap

- **v1 sync is manual** (file picker + passphrase). **v2:** Google Drive auto-fetch (the
  `VITE_GOOGLE_*` env vars exist for this).
- App lock is **PIN-only** (PBKDF2 hash); biometric/WebAuthn not yet implemented.
- `decryptFlexible()` is heuristic until validated against a real txn export.
- Bundle is one ~170 KB-gzipped chunk (route-level code-splitting is a possible optimization).
- Worker labour uses the worker's **current** `dailyWage` (historical wage changes aren't
  versioned).

## Run / build / deploy locally

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # → dist/ (+ service worker)
npm run preview    # serve the built app
npm run typecheck  # tsc --noEmit

# Android (needs Android SDK + JDK 17 locally; CI does this automatically):
npm run build && npx cap add android && npm run android:patch && npx cap sync android
cd android && ./gradlew assembleDebug   # → android/app/build/outputs/apk/debug/app-debug.apk
```
