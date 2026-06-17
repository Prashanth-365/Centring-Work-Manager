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
  (Radix primitives in `src/components/ui/`). Routing is `BrowserRouter` + `<Routes>`.
- **Dexie.js / IndexedDB** — all data local. No backend, no server.
- **PWA** via `vite-plugin-pwa` (installable + offline). Also packaged as an **Android APK**
  via **Capacitor** in CI.
- Pure business logic lives in `src/lib/compute/` and is **unit-testable** (no React/Dexie) —
  see the `*.test.ts` files run by **vitest** (`npm run test`). Screens load data with Dexie
  `useLiveQuery` hooks (`src/lib/hooks.ts`) and pass arrays into those pure functions. Writes go
  through `src/lib/repo.ts` (consistent ids/timestamps).

**This is a separate app from the transaction app.** It must **never modify** the transaction
app. It only **reads** that app's exported backup, **one-way**, via a **file picker** or the
**Google Picker**. The decrypt happens in memory; only `Construction` transactions are persisted.

### Key files
```
src/lib/
  db.ts          Dexie schema (v2) + migration + seed (settings, otherExpenseTypes)
  types.ts       domain types
  crypto.ts      AES-256-GCM / PBKDF2-SHA256 (200k) + decryptFlexible()  ← txn-app interop point
  sync.ts        read txn backup → extractConstruction() → upsert by UUID (+ importFingerprint); throws descriptive diagnostics (names the categories/keys it saw) when "Construction" is missing or the shape is unexpected
  backup.ts      this app's own backup / restore — plain-JSON { version, exportedAt, data:{...tables} } (buildDataBackup/restoreDataBackup, local on-device) AND the encrypted envelope cwm-backup-v1 (buildBackupEnvelope/restoreFromText, used for Google Drive) + verifyEnvelopePassphrase() for the pre-overwrite check
  files.ts       platform-aware saveTextFile() — web Blob download / Android @capacitor/filesystem write to External `finsite-construction/`
  toast.ts       framework-agnostic toast store (toast.success/error/info + useToasts) so non-React code (drive.ts) can notify too
  repo.ts        create/update helpers, setWorkerWage, attendance block-clash guard, categoryMap CRUD
  hooks.ts       Dexie useLiveQuery hooks
  select.ts      shared selectors (byId, groupBy, buildingName, computeBuilding, currentMold)
  autoAdvance.ts status↔date runtime: runAutoAdvance() + startDailyAutoAdvance() (load/midnight/foreground)
  native.ts      Capacitor wrappers (isNative, hardware back button, app-state)
  biometric.ts   WebAuthn (web) / Capacitor biometric (native) unlock
  drive.ts       Google Drive — GIS token client → encrypted backup in the user's private appDataFolder (scope `drive.appdata`; connectDrive/backupToDrive/restoreFromDrive/peekDriveBackupText); in-memory token w/ expiry, userinfo, revoke-on-disconnect, 401-retry; client id from VITE_GOOGLE_CLIENT_ID or settings.googleClientId
  env.ts         defensive VITE_* access (Google client id / redirect)
  compute/       shifts.ts · food.ts · wage.ts · status.ts · balance.ts · profit.ts · weekly.ts (+ *.test.ts)
src/components/  UI kit + shell (AppShell, BottomNav, BackButtonHandler, LockGate, PageHeader, FormScaffold, …)
src/screens/     Dashboard, buildings/, molds/, workers/, owners/, attendance/, payments/, settings/, Weekly, More, Settings
```

## Data model (Dexie, all keyed on UUID `id`)

- **buildings** — `id, ownerId?, location?, startDate?, endDate?, ratePerSqft?, status, photoThumb?, notes?`.
  **No stored name** — the display name is **derived** as `"{owner.name} - {location}"` via
  `buildingName()` in `select.ts`, so editing the owner or location updates it everywhere.
- **molds** (one mold = one floor) — `id, buildingId, floorName, order, startDate?, endDate?, sqft?,
  billAmount?, billPdfLink?, workStatus, paymentStatus, notes?`
- **workers** — `id, name, type(Helper|Carpenter|Outsider), wageHistory[], phone?, active, photoThumb?,
  foodMode, foodBreakfast, foodLunch, foodPerDay?, foodPerWeek?, maxDaysPerWeek, notes?`.
  **`wageHistory` is `{ effectiveFrom, dailyWage }[]`** (effective-dated, §7) — read via
  `wageOnDate()` / `currentWage()` (`compute/wage.ts`), never `[0]`.
- **owners** — `id, name, phone?, location?, photoThumb?, notes?`
- **attendance** (= "work done") — `id, workerId, buildingId, moldId?, date, shiftFrom?, shiftTo?,
  blocks[], dayFraction, notes?`. A worker can't have the **same block twice on a date** — enforced
  in `repo.ts` (`blocksTakenOnDay`/`assertNoBlockClash`) and surfaced in the form.
- **syncedTransactions** — `id (the txn UUID), date, dateTime?, amount, direction, txnType?,
  subCategory (our mapped type), typeName? (raw source name), importFingerprint?, description?,
  lastSeenAmount, assignmentStatus(unassigned|assigned|needsReview), buildingId?, moldId?, workerId?,
  materialDescription?, otherExpenseType?`
- **categoryMap** — `id, sourceName, type` (txn sub-category NAME → our `SubCategory`)
- **otherExpenseTypes** — `id, name` (seeded `FinanceCost`, `Theft`)
- **settings** (single row `id:'app'`) — shift blocks, default food, `collectAlertDays`, `weekStartsOn`,
  `appLock { enabled, method('pin'|'biometric'), pinHash?, salt?, webauthnCredId?, relockMinutes? }`

> **No `dailyFood` table.** Food is day-wise but **computed live** (group attendance by worker+date,
> union the blocks) — identical result to a materialized store, no denormalization to keep in sync.
> See "Why" below. Codes (short slugs) were removed from buildings/workers/owners — assignment is by
> selecting the entity in-app.

**Dexie v2 migration** (`db.ts`): drops `name`/`code` from buildings, `code` from workers/owners,
converts the old single `dailyWage` → `wageHistory: [{ effectiveFrom: <created date>, dailyWage }]`,
and adds the `categoryMap` table + an `importFingerprint` index.

## Core business logic

**Shifts → dayFraction** (`compute/shifts.ts`): 3 configurable blocks (default 06:00–09:00,
09:30–13:00, 14:00–18:00), each = 0.5 day. A from–to time auto-maps to blocks (≥50% overlap);
blocks are also toggled manually. `dayFraction = 0.5 × blocks worked, capped at 1.5` (3rd block
is OT at **normal** rate).

**Meals (day-wise, §6):** computed from the **union of all blocks worked that day** (across
buildings), once per worker per day — **breakfast needs BOTH blocks 1 and 2; lunch needs BOTH 2
and 3.** So `{1,2}→breakfast`, `{2,3}→lunch`, `{1,2,3}→both`, **`{1,3}→none`** (block 2 is required
for any meal). `mealFlags()` in `shifts.ts`.

**Food (calculated, `compute/food.ts`)** — three modes, all day-wise:
- `meal`: breakfast/lunch amounts per the day's union (above).
- `fixedPerDay`: `foodPerDay × the day's union day-fraction`.
- `fixedPerWeek`: per ISO-week, `foodPerWeek × (Σ day-fractions that week / maxDaysPerWeek)`.

**Effective-dated wages (`compute/wage.ts`, §7):** `wageOnDate(worker, date)` = the entry with the
greatest `effectiveFrom ≤ date` (fallback: earliest rate). Editing a wage **appends** an entry
(`repo.setWorkerWage` / `withWage`), so past attendance keeps its old rate.

**Two separate money layers (DO NOT merge them):**

- **Worker balance — cash settlement** (`compute/balance.ts`):
  `owed = wage (Σ dayFraction × wageOnDate) + calculated food`;
  `paid = Σ assigned txns with subCategory ∈ {Wage, Advance, Food}`;
  `balance = owed − paid`. **Transport & Rent assigned to a worker do NOT affect the balance** —
  they're provisions → overhead.
- **Profit — accrual / cost-based** (`compute/profit.ts`):
  per building `margin = OwnerReceipts − attendance labour` (labour from **attendance** at the
  **wage effective on each attendance date**, never from wage payments); business-wide
  `overhead = calculated food + Transport + Rent + Material + OtherExpense`;
  `total profit = Σ building margins − overhead`.

**No-double-count rules (load-bearing — keep them true):**
1. **Food is counted once**, as a *calculated* cost in overhead. A `Food` *transaction* only
   reduces the worker's balance; it is never re-added as a cost.
2. **Building labour comes from attendance** (effective-dated wage), not from `Wage` transactions.
3. **Wage/Advance/Food transactions are cash settlement** (balance only), never re-added as cost.

`compute/weekly.ts` builds the payroll register: per worker per Mon–Sun day-fractions, totals, wage
(per-day at the effective rate, with a `wageChangedMidWeek` flag), food, paid (txns dated that week),
current, previous balance (cumulative before the week), final balance.

## Status ↔ date engine (`compute/status.ts` + `autoAdvance.ts`, §4)

Status and dates stay in sync **both directions** and auto-advance as real dates arrive.

- **Date → status** (pure, in `status.ts`): building `Yet to Start / In Progress / Completed` from
  start/end dates; **On Hold / Closed are manual and win** (`deriveBuildingStatus` returns null).
  Molds mirror this on their own dates (`deriveMoldWorkStatus`). **Mold payment status is NOT
  date-driven** — `deriveMoldPaymentStatus(bill, received)` → Not Billed / Billed / Partly Paid / Paid.
- **Status → date** (`datesForStatusChange` / `moldDatesForStatusChange`): the forms apply these when
  the user picks a status (e.g. In Progress sets `startDate=today`; Completed sets `endDate=today`).
- **Auto-advance** (`autoAdvance.runAutoAdvance`): on app load, at local midnight, and on foreground
  (`startDailyAutoAdvance`, mounted in `LockGate`), recompute and persist any changed status. A
  building **auto-Closes** when Completed AND every mold is Paid (`shouldAutoClose`). Forms call
  `runAutoAdvance()` after save so payment/work status reconcile immediately.

## Transaction integration convention

- The txn app exports `{ data: { categories:[{id,name,parentID}], transactions:[{id, dateTime,
  categoryId, subCategoryId, amount, txnType, importFingerprint, …}] } }`. Top-level category
  `name === "Construction"` (`parentID == null`) is the root; its children are the sub-categories.
- **Sync** (`sync.ts`): `extractConstruction()` parses that shape (with a heuristic fallback for
  older/unknown exports), resolves each sub-category **name → our type** via the `categoryMap`
  (auto-matched + persisted on first sight; correct any in **Settings → Category mapping**), and
  **upserts by `id` (UUID), NEVER `slNo`**. New `id` → `unassigned`. Existing `id` whose
  `amount !== lastSeenAmount` → **`needsReview`** (keeps the prior assignment). `importFingerprint`
  is a secondary identity signal: if an assigned txn's `id` disappears and a new txn shares its
  fingerprint, the **assignment carries across**. The passphrase is **optional** — a plain-JSON
  backup is read directly.
- **Review queue** = `unassigned` + `needsReview`. Assignment fields are chosen **by subCategory**
  (`SUBCATEGORY_FIELDS`): OwnerReceipt→building(+mold); Wage/Advance/Food/Transport/Rent→worker;
  Material→free-text; OtherExpense→type (add-new). All entity pickers are autocomplete `Combobox`es.
- **⚠️ The one crypto interop point:** `crypto.ts → decryptFlexible()`. Built without a real sample
  export — if a real encrypted file fails, adjust `CRYPTO_FIELD_NAMES` / `PACKED_LAYOUT`. Field-name
  detection for the JSON shape lives in `sync.ts` (`*_KEYS`).

## Statuses & dashboard

- **Building:** `Yet to Start, In Progress, On Hold, Completed, Closed` (Closed = work done AND fully paid).
- **Mold work:** `Not Started, In Progress, Done/Removed`. **Mold payment** (auto-derived): `Not Billed,
  Billed, Partly Paid, Paid`.
- **Dashboard** (`screens/Dashboard.tsx`): operational top first — active buildings (derived name,
  current mold + statuses, running margin, "unpaid ₹X" badge), a **Go-collect** list (Done/Removed &
  not Paid past `collectAlertDays`, default 18, with aging), and a "transactions to assign: N" nudge —
  then the **money** section: total profit after overhead, receivables, money owed to workers, this
  week's wages, overhead this month, profit by building. Closed buildings are hidden from the top.

## App lock, biometrics & Google Drive

- **App lock** (`LockGate.tsx`): a PIN (PBKDF2 hash) is the base + fallback. **Biometric unlock**
  (`biometric.ts`) layers on top — **WebAuthn** platform authenticator on web (credential id in
  `appLock.webauthnCredId`; ceremony success = unlock, no server), a **Capacitor biometric plugin**
  on the APK (lazy-loaded). The app **re-locks** after being backgrounded longer than `relockMinutes`
  (default 2) via `visibilitychange` + native `appStateChange`.
- **Hardware back button** (`native.ts` + `components/BackButtonHandler.tsx`): on Android, Back pops
  router history and exits only when already on a root tab (`/`, `/buildings`, `/workers`, `/payments`,
  `/more`).
- **Google Drive** (`drive.ts`): **encrypted, app-private backup** of THIS app's own data into the user's
  own Drive. Enabled once a client id exists — `VITE_GOOGLE_CLIENT_ID` (the spec's "one shared app Client
  ID") or an optional per-device override in **Settings → Data** (`settings.googleClientId`, applied via
  `setDriveClientId()`, synced at boot in `LockGate`); `driveConfigured()` gates the UI. Auth is the **GIS
  token client** with scope `openid email profile https://www.googleapis.com/auth/drive.appdata`. The token
  is **in-memory only** (expiry tracked with a 5s skew), `connectDrive()` fetches userinfo (email shown +
  stored as `settings.driveEmail`), `disconnectDrive()` **revokes** it, and `authedFetch()` **retries once
  on 401** + maps the common 403s (API disabled / missing scope) to actionable messages. Backup/restore
  prompt for a **passphrase (min 8)** and run through the **encrypted envelope** (`buildBackupEnvelope()` /
  `restoreFromText()`), uploading the single fixed file `construction-backup.json.enc` to the hidden
  **`appDataFolder`** (overwritten in place; `parents:['appDataFolder']`). Before overwriting, the existing
  backup is downloaded and the passphrase **verified** (`peekDriveBackupText()` + `verifyEnvelopePassphrase()`)
  so a typo can't lock the next restore. `appDataFolder` is **isolated per OAuth client**, so this can never
  collide with the finance app's own app-data. **Finance import stays a manual local-file step** on the Sync
  screen (the appData scope can't see other apps' files, so the Drive Picker was removed). On **native** the
  GIS flow can't run in a WebView yet, so Drive shows an honest "use the web app / local backup" message;
  `public/oauth-redirect.html` + `VITE_OAUTH_REDIRECT_URL` are staged for the future Android Custom-Tab flow.
  All actions report success/failure through **toasts** — never silently.
- **Data backup/restore** (`backup.ts` + `files.ts`): **Settings → Data** also exports every Dexie table as a
  **local plain-JSON** `{ version, exportedAt, data }` file — web downloads a Blob, Android writes via
  `@capacitor/filesystem` to External `finsite-construction/` (`saveTextFile()`). Restore validates the
  shape (`validateDataBackup()` — descriptive errors, detects an encrypted envelope), then **replaces all
  local data** behind a destructive-confirm dialog. (Local = plain-JSON for convenience; Drive = always
  encrypted.)

## Deployment

- **Web (Vercel):** import the repo (Vite preset); push to `main` → auto-build & deploy. `vercel.json`
  adds the SPA fallback rewrite.
- **Android APK (Capacitor + GitHub Actions):** `.github/workflows/build-apk.yml` → Node 20 / JDK 17 /
  Android SDK → `npm install` (no lockfile committed) → `npm run build` → `npx cap add android`
  (`android/` not committed) → `scripts/patch-android.sh` (idempotent: SDK versions, INTERNET
  permission) → `npx cap sync android` (pulls in `@capacitor/app` + the biometric plugin) →
  `./gradlew assembleDebug` → artifact **`centering-debug-apk`**; on `v*` tags attach to a Release.
  `capacitor.config.ts`: appId `app.centering.manager`, appName "Centering Work Manager", webDir `dist`.
- **Env vars** (`VITE_GOOGLE_CLIENT_ID`, `VITE_OAUTH_REDIRECT_URL`) configure encrypted Drive backup:
  `VITE_GOOGLE_CLIENT_ID` is the shared app Client ID (a per-device id in **Settings → Data** overrides it);
  `VITE_OAUTH_REDIRECT_URL` points at the hosted `public/oauth-redirect.html` used only by the future
  Android Custom-Tab flow. In Google Cloud: create one **Web** OAuth client, **enable the Drive API**, and
  add the **`drive.appdata`** scope on the consent screen. `VITE_*` ships in the client bundle (Vercel
  "Sensitive = OFF"); read defensively via `env.ts` so the app builds/runs fine without them (offline +
  local backup paths unaffected).

## Why (deliberate decisions — don't undo)

- **Separate apps / read-only toward the txn app / UUID `id` not `slNo`:** keeps the txn app clean;
  `slNo` re-sequences on backdated inserts, UUIDs survive re-import and let amount-change re-flagging
  and fingerprint carry-over work.
- **Derived building names:** the name is `{owner} - {location}` so renaming an owner or fixing a
  location updates it everywhere with zero data drift; no stale stored copy.
- **Effective-dated wages (`wageHistory`):** raising a worker's rate must not retroactively change the
  cost of past attendance, so wages are versioned and labour is computed at the rate effective on each
  attendance date.
- **Food calculated day-wise, not transactional, not a stored table:** food derives from attendance +
  per-worker config so it's consistent in the weekly register and overhead and never double-counted
  with a `Food` cash payment. Computing it live (vs. a materialized `dailyFood` row) avoids a
  denormalized store that would have to be recomputed and kept in sync on every attendance write.
- **Overhead as a separate business-wide bucket** (not per-building): food/transport/rent/material/
  other aren't cleanly attributable to one building; per-building would distort margins.
- **Mold payment status auto-derived from bill + receipts:** there's one source of truth (the assigned
  OwnerReceipts vs. the bill), so there's no manual status to drift out of sync.

## Known limitations & roadmap

- **Google Drive (web) is built but unverified end-to-end** — encrypted backup to `appDataFolder` needs a
  real Google client id (`VITE_GOOGLE_CLIENT_ID` or a per-device id in **Settings → Data**) + OAuth consent
  with the `drive.appdata` scope; the GIS/OAuth flow couldn't be exercised in CI/headless.
- **Android Drive sign-in is deferred** — GIS won't run in a WebView, so native shows an honest "use the web
  app / local backup" message. The Chrome-Custom-Tab + deep-link flow (`public/oauth-redirect.html`,
  `app.centering.manager://oauth-success`, `@capacitor/browser`) is staged but not wired up yet.
- **Reading the finance app's Drive backup is out of scope by design** — it lives in *that* app's own
  `appDataFolder` (isolated per OAuth client). Finance import stays a manual local-file step until a shared
  Client ID or a common visible file is introduced later.
- **Native biometric is unverified on-device** — the web WebAuthn path is testable; the APK path uses a
  Capacitor plugin that needs a real device/build to confirm.
- `decryptFlexible()` is heuristic until validated against a **real encrypted** txn export.
- Bundle is one ~180 KB-gzipped chunk (route-level code-splitting is a possible optimization).

## Run / build / test / deploy locally

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # → dist/ (+ service worker)
npm run preview    # serve the built app
npm run typecheck  # tsc --noEmit
npm run test       # vitest — pure compute unit tests

# Android (needs Android SDK + JDK 17 locally; CI does this automatically):
npm run build && npx cap add android && npm run android:patch && npx cap sync android
cd android && ./gradlew assembleDebug   # → android/app/build/outputs/apk/debug/app-debug.apk
```
