# CLAUDE.md — Centering Manager

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
  backup.ts      this app's own data — plain-JSON { version, exportedAt, data:{...tables} } (buildDataBackup/restoreDataBackup) AND the encrypted envelope cwm-backup-v1 (buildBackupEnvelope/restoreFromText). Used by both Export/Import and Google Drive — BOTH honor the encrypt toggle (plain or encrypted) + verifyEnvelopePassphrase() for the pre-overwrite check on encrypted Drive backups
  theme.ts       light/dark theme — applyTheme()/storedTheme() toggle the `dark` class on <html> (+ color-scheme), persist to settings.theme (Dexie) and mirror to localStorage['cwm-theme'] for the flash-free inline boot script in index.html. Default dark
  files.ts       platform-aware saveToDownloads()/saveBinaryToDownloads() — web Blob download / Android @capacitor/filesystem write to the public Downloads (Directory.ExternalStorage `Download/`, falling back to app-External when scoped storage blocks it) + downloadStamp() (YYYYMMDD-HHmmss filenames)
  weeklyPdf.ts   native weekly-summary print — lazy jspdf + jspdf-autotable render the selected week to a LANDSCAPE PDF, written to the app CACHE dir via @capacitor/filesystem and handed to @capacitor/share (the Android print/share intent). Sharing from Cache (NOT a public Downloads path) is what makes native print work — a Downloads file:// URI throws Android's FileUriExposedException. Web keeps window.print(); this module is only imported on native so jspdf never enters the web bundle (workbox globIgnores keep the PDF libs out of the web PWA precache)
  toast.ts       framework-agnostic toast store (toast.success/error/info + useToasts) so non-React code (drive.ts) can notify too. Every variant uses an OPAQUE (bg-card) background so messages stay legible over scrolled content
  repo.ts        create/update helpers, setWorkerWage, attendance block-clash guard, categoryMap CRUD
  hooks.ts       Dexie useLiveQuery hooks
  select.ts      shared selectors (byId, groupBy, buildingName, computeBuilding, currentMold)
  autoAdvance.ts status↔date runtime: runAutoAdvance() + startDailyAutoAdvance() (load/midnight/foreground); also auto-starts a mold from its earliest attendance date
  native.ts      Capacitor wrappers (isNative, hardware back button, app-state, best-effort landscape orientation lock)
  biometric.ts   WebAuthn (web) / Capacitor biometric (native) unlock
  drive.ts       Google Drive — GIS token client → encrypted backup in the user's private appDataFolder (scope `drive.appdata`; connectDrive/backupToDrive/restoreFromDrive/peekDriveBackupText); in-memory token w/ expiry, userinfo, revoke-on-disconnect, 401-retry; client id from VITE_GOOGLE_CLIENT_ID or settings.googleClientId
  env.ts         defensive VITE_* access (Google client id / redirect)
  compute/       shifts.ts · food.ts · wage.ts · status.ts · balance.ts · profit.ts · weekly.ts (+ *.test.ts)
src/components/  UI kit + shell (AppShell, BottomNav, SideNav, BackButtonHandler, LockGate, PageHeader, FormScaffold, PeriodSelector + PeriodPicker, …)
src/screens/     Dashboard, buildings/, molds/, workers/, owners/, attendance/, payments/, settings/, Weekly, More, Settings
```

**Responsive shell (`AppShell` + `SideNav` + `BottomNav`):** mobile-first single `max-w-md` column with the
bottom tab bar below `md`; at `md+` the bottom bar is hidden and a left **SideNav** (Home/Buildings/Workers/
Owners/Attendance/Payments/Weekly/Settings) appears, with content constrained to `max-w-4xl` and the
Dashboard's analytical sections flowing into two columns (`xl:grid-cols-2`). `SideNav` is a `<nav>` so the
print stylesheet (which hides `nav`) drops it on paper. Focused **forms** use `FormScaffold`; passing
**`wide`** (e.g. the Attendance form) switches it from the full-bleed mobile column to a centered
`md:max-w-3xl` container with multi-column field grids and a right-aligned button row on desktop.

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
  `encryptBackup?` (default true — controls Export/Import AND Google Drive backup encryption),
  `theme?` ('light'|'dark', default 'dark' — UI theme, applied via the `dark` class on <html>; see "Theme"),
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
current, previous balance (cumulative before the week), final balance. **`screens/Weekly.tsx`** renders
this wide table with week prev/next. **Only workers with attendance that week (`totalDays > 0`) are
listed**; a "Show all active workers" toggle reveals everyone (incl. zero-day workers carrying a
balance), and the stat cards + table footer foot to the *displayed* rows (`sumRows`). It also has a
**Maximize** button (full-screen, landscape-optimized overlay that best-effort-locks the device to
landscape via `native.ts`, stays horizontally scrollable, and supports **pinch- and button-zoom** (CSS
`zoom`; pinch uses non-passive touch listeners so it doesn't fight page zoom) **plus one-finger
drag-to-pan** — Pointer Events on the `touch-action: none` container start a drag past a >5px threshold,
set pointer capture, and adjust scrollLeft/Top; a 2nd pointer yields to the pinch handler and the
scrollbars remain a fallback) and a **Print** button. **Print is platform-aware:** on **web** it's
`window.print()` (the `@media print` sheet in `index.css` — `@page { size: landscape }`, app chrome
hidden, a `table-layout: fixed` `.weekly-print-table` scaled so every column fits); on **native** the
WebView can't open the system print dialog, so `lib/weeklyPdf.ts` renders the selected week to a landscape
PDF (jspdf + jspdf-autotable), writes it to the app **Cache** dir (`@capacitor/filesystem`), and hands
that file to the Android share/print sheet (`@capacitor/share`). Sharing from **Cache** (not a public
Downloads path) is the fix for the `FileUriExposedException` that previously broke native print.

**Measurement bills (`compute/bill.ts` + `screens/bills/`):** a floor's bill is stored **inline on the
mold** (`Mold.bill: MoldBill`) so it rides along with backups/sync automatically. A bill = ordered,
collapsible/reorderable **sections** (Slab, Beams, Columns…), each with L×H×No rows, plus flat-amount
**extras**, a `ratePerSqft` (prefilled from the building), and an optional **advance deduction** (manual
or referencing tracked receipts via `receiptsForMold()`). Measurements accept **decimal or ft-in** entry
(`2.11` = 2′ 11″, inches capped at 11, toggle per bill); raw dims are never rounded — only **row/section
totals round UP to the nearest 0.25 sqft** (`quarterUp()`). All math is pure & unit-tested
(`compute/bill.test.ts`). Saving goes through **`repo.saveMoldBill()`**, which persists the bill and
**syncs `mold.billAmount` + `mold.sqft`** from `billTotals()` — so payment status, outstanding, and all
existing money flows pick the bill up with zero special-casing. Screens: **`BillEditor`**
(`/molds/:id/bill`, focused route without bottom nav) to create/update, **`MoldBillView`**
(`/molds/:id/bill/view`) and **`BuildingBillView`** (`/buildings/:id/bill`, consolidated roll-up of all
floor bills + building grand total) to view/print. Print uses `<thead>/<tfoot>` on `.bill-print-table`
so the company head + signature foot repeat on every page; bills print **portrait** (a
`usePortraitPrint()` hook injects an `@page` override, since the global print sheet is landscape for the
weekly register). Entry points: a bill icon + "Consolidated bill" action on **BuildingDetail**, and a
bill icon + Bill/Create-bill button beside the dates on **MoldDetail**. The pre-existing external
**`billPdfLink`** (open a Drive/PDF link) is kept intact on both MoldDetail and the bill editor.

**Period selector (`components/PeriodSelector` + `PeriodPicker`):**
prev/next steps; tapping the label opens a picker (calendar week-picker, month grid, or decade year
grid, defaulting to the current period). Used by the Dashboard money/overhead sections and the profit
breakdown; the chosen `Period` (`compute`/`dates.ts` helpers) scopes those figures.

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
- **Attendance auto-starts a mold (§4):** a mold that is Not Started but has attendance recorded
  began on its **earliest attendance date** — `runAutoAdvance` stamps that `startDate`
  (`moldStartFromAttendance` in `status.ts`, never overriding an existing one), which flips the mold
  to In Progress and cascades the building roll-up + derived building `startDate` (min mold start) in
  the same pass. `repo.ts` attendance create/update/delete therefore call `runAutoAdvance()`, so
  logging work on an all-Not-Started building moves it to In Progress automatically.

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
- **Assigned tab filters** (`screens/payments/Payments.tsx`): a **date-range** filter + a **multi-select
  category** filter — the 7 base sub-categories plus one chip per OtherExpense type (FinanceCost, Theft, …)
  plus a catch-all **Other** (uncategorised OtherExpense). Category keys (`Transport`, `other:FinanceCost`,
  `other:__rest__`, …) double as deep-link params: the screen accepts `?tab=assigned&cat=<key>&from=&to=`,
  used by the Dashboard overhead lines.
- **Attendance list filters** (`screens/attendance/AttendanceList.tsx`): main row = worker + building +
  date range; **Advanced** = mold/floor (scoped to the chosen building) — same pattern as Buildings/Workers.
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
  week's wages, overhead, profit by building. Closed buildings are hidden from the top. The **overhead**
  block is a **clickable list**: transaction-backed lines (Transport / Rent / Material + one line per
  OtherExpense type — FinanceCost / Theft / … — + a catch-all "Other") deep-link to the Assigned-Payments
  list filtered by that category **and** the overhead period's date range; the **Food** line is a
  *calculated* figure (not a transaction) so it opens a per-worker food breakdown dialog for the period
  instead (`FoodBreakdownDialog`). On wide screens the money/overhead/profit/you-owe sections lay out in
  two columns.

## App lock, biometrics & Google Drive

- **App lock** (`LockGate.tsx`): a PIN (PBKDF2 hash) is the base + fallback. **Biometric unlock**
  (`biometric.ts`) layers on top — **WebAuthn** platform authenticator on web (credential id in
  `appLock.webauthnCredId`; ceremony success = unlock, no server), a **Capacitor biometric plugin**
  on the APK (lazy-loaded). The app **re-locks** after being backgrounded longer than `relockMinutes`
  (default 2) via `visibilitychange` + native `appStateChange`.
- **Hardware back button** (`native.ts` + `components/BackButtonHandler.tsx`): Back **always funnels to
  Home and only ever exits from Home**. On a nested/detail page it pops router history; on a top-level
  tab other than Home (`/buildings`, `/workers`, `/payments`, `/more`) or when history is exhausted it
  redirects to `/`; on Home the first Back shows a "Press back again to exit" toast and a second Back
  within ~2s calls `exitApp()` (Android). In-app history depth is read from `history.state.idx` (React
  Router v6) for reliable WebView detection.
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
  GIS flow can't run in a WebView yet, so Drive shows an honest "use the web app / Export to a file" message;
  `public/oauth-redirect.html` + `VITE_OAUTH_REDIRECT_URL` are staged for the future Android Custom-Tab flow.
  All actions report success/failure through **toasts** — never silently.
- **Export / Import** (`backup.ts` + `files.ts`): there is **no separate local backup/restore** — data already
  persists in IndexedDB. **Settings → Data** offers **Export** and **Import** plus an **"Encrypt backup /
  export"** toggle (`settings.encryptBackup`, default ON; turning it OFF shows a warning that the file will
  be readable by anyone). **Export** writes a timestamped `centering-export-YYYYMMDD-HHmmss.json` to
  **Downloads** (web Blob download / Android `saveToDownloads()`): encrypted via the envelope when the toggle
  is on (prompts a passphrase, min 8), plain JSON when off. **Import** picks a file, auto-detects encrypted
  (`ciphertext`) vs plain — prompting for the passphrase only when encrypted — then **replaces all local
  data** behind a destructive-confirm dialog (`restoreFromText()` / `restoreDataBackup()`). **Google Drive
  backup now honors the SAME `encryptBackup` toggle:** encrypted via the envelope (passphrase, min 8) when
  on, plain JSON when off (gated behind an unencrypted-backup warning dialog). Drive **restore** downloads
  the file, auto-detects encrypted vs plain (`isEncryptedBackup()` — shared with Import), and prompts for a
  passphrase only when encrypted; the pre-overwrite passphrase check runs only against an existing
  *encrypted* backup. No crypto is duplicated — both paths reuse `backup.ts` / `crypto.ts`.

## Theme (light / dark)

Both themes ship via the existing CSS-variable strategy — light tokens in `:root`, dark under `.dark`
(`index.css`), Tailwind `darkMode: 'class'`. `lib/theme.ts` (`applyTheme`/`storedTheme`) toggles the `dark`
class on `<html>` (and sets `color-scheme`). The choice persists in **`settings.theme`** (Dexie — so it
travels with Export/Drive backups) and is **mirrored to `localStorage['cwm-theme']`** so the tiny inline
script in `index.html` applies it **before first paint** (no flash). **Default is dark** (the app's original
look); `LockGate` reconciles the DOM from the persisted setting on boot (covers post-restore drift), and
**Settings → Appearance** flips it live. No chart library is used — every surface reads semantic tokens, so
both themes work without per-component overrides.

## Deployment

- **Web (Vercel):** import the repo (Vite preset); push to `main` → auto-build & deploy. `vercel.json`
  adds the SPA fallback rewrite.
- **Android APK (Capacitor + GitHub Actions):** `.github/workflows/build-apk.yml` → Node 20 / JDK 17 /
  Android SDK → `npm install` (no lockfile committed) → `npm run build` → `npx cap add android`
  (`android/` not committed) → **decode signing keystore** (`ANDROID_KEYSTORE_B64` → `android/app/release.keystore`)
  → `scripts/patch-android.sh` (idempotent: SDK versions, INTERNET permission, OAuth deep-link, **version +
  signing**) → **`npx @capacitor/assets generate --android`** (adaptive launcher icons from `assets/` — must run
  AFTER the signing patch and BEFORE sync) → `npx cap sync android` (pulls in `@capacitor/app`, the biometric
  plugin, `@capacitor/share`) → `./gradlew assembleDebug` → artifact **`centering-debug-apk`**; on `v*` tags
  attach to a Release. `capacitor.config.ts`: appId `app.centering.manager` (**never change — keeps in-place
  updates working**), appName "Centering Manager", webDir `dist`.
- **Consistent APK signing (so updates install in-place — no "package conflict"):** because `android/` is
  regenerated every run (each `assembleDebug` would otherwise pick a fresh random debug key), `patch-android.sh`
  **appends an extra `android {}` block** to `app/build.gradle` that (a) sets `versionCode` from
  `CWM_VERSION_CODE` (= `github.run_number`, always increasing) + a readable `versionName` (`CWM_VERSION_NAME`),
  and (b) when `android/app/release.keystore` exists, declares a `release` signingConfig reading
  `ANDROID_KEYSTORE_PASSWORD` / `ANDROID_KEY_ALIAS` / `ANDROID_KEY_PASSWORD` from the env and applies it to
  **both `debug` and `release` build types** — so every APK carries the **same signature**. With no keystore
  secret set the build still succeeds on the default debug key (no signature stability, but no breakage).
- **Env vars / CI secrets:**
  - `VITE_GOOGLE_CLIENT_ID`, `VITE_OAUTH_REDIRECT_URL` — encrypted Drive backup. `VITE_GOOGLE_CLIENT_ID` is the
    shared app Client ID (a per-device id in **Settings → Data** overrides it); `VITE_OAUTH_REDIRECT_URL` points
    at the hosted `public/oauth-redirect.html` (future Android Custom-Tab flow). In Google Cloud: one **Web** OAuth
    client, **enable the Drive API**, add the **`drive.appdata`** scope. `VITE_*` ships in the client bundle (Vercel
    "Sensitive = OFF"); read defensively via `env.ts` so the app builds/runs fine without them.
  - **Android signing secrets** (GitHub repo → Settings → Secrets → Actions): `ANDROID_KEYSTORE_B64` (base64 of the
    `.jks`/`.keystore`), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. Generate once with
    `keytool` and keep them forever — re-generating the key changes the signature and breaks in-place updates.

## App identity & icons

- **Display name is "Centering Manager"** (short name "Centering"). Set in `capacitor.config.ts` (`appName`,
  drives Android `app_name`), the PWA manifest in `vite.config.ts` (`name`/`short_name`), `index.html`
  `<title>`, and a few UI/footer strings (`SideNav`, `Settings`, `More`). The Android **package / `appId`
  stays `app.centering.manager`** so updates install in place — **renaming is display-only.**
- **Icon source art lives in `assets/`** (the `@capacitor/assets` convention): `icon-only.png` (full-bleed,
  used for PWA "any" + apple-touch + favicons), `icon-foreground.png` + `icon-background.png` (amber→orange
  gradient) for the Android **adaptive** icon and the **maskable** PWA icon.
  - **Web/PWA PNGs** are generated by `scripts/gen-pwa-icons.mjs` (sharp) into **`public/icons/`**
    (`icon-192/512` "any", `icon-512-maskable` = foreground-over-background, `apple-touch-icon`, `icon-16/32`)
    and wired into the manifest `icons` array + `index.html`. We do **not** use `@capacitor/assets generate
    --pwa` for these — it emits WebP and tags every icon "any maskable" without a real safe-zone composite.
  - **Android adaptive icons** are generated in CI by `npx @capacitor/assets generate --android` (run after
    the signing patch, before `cap sync`). `android/` is gitignored, so this is CI-only.
  - Brand color is **`#F97316`** (`theme_color`, manifest `background_color`/splash, `index.html` theme-color).
- **⚠️ Do not confuse the display name with the backup format marker.** `backup.ts` stamps every envelope with
  `app: 'centering-work-manager'` and validates it on restore — that literal is a **format id**, independent of
  the display name / `package.json` name. Changing it would make existing local + Google-Drive backups
  un-restorable. Leave the three `'centering-work-manager'` literals in `backup.ts` alone.

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
- Main web chunk is ~195 KB gzipped; the PDF libs (jspdf/jspdf-autotable/html2canvas) are **lazy, native-only**
  chunks (loaded only when printing the weekly summary on the APK) and are kept out of the web PWA precache.
  Route-level code-splitting of the main chunk is still a possible optimization.
- **Native weekly print + Android signing are unverified on-device** — they build and the web/typecheck/test
  paths pass, but the landscape-PDF share intent and the consistent-keystore in-place update need a real device
  + the four `ANDROID_*` secrets set in CI to confirm.

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
