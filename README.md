# Centering Work Manager

A mobile-first, offline-first PWA for a sole centering / shuttering contractor ("Meistri").
It tracks **buildings → molds (floors) → work (attendance)**, **workers** and their pay,
**owners** and what they owe, and reads money in/out from a separate personal-finance
transaction app to show **profit per building** and **what you're owed**.

This is a **standalone app**. It never modifies the transaction app — it only *reads* that
app's exported encrypted backup and assigns the `Construction` transactions here.

## Stack

- React + Vite + TypeScript
- Tailwind CSS + a hand-rolled shadcn/ui-style component kit (Radix primitives)
- Dexie.js (IndexedDB) — all data local, no backend, no server
- PWA via `vite-plugin-pwa` (installable, offline)
- Web Crypto: AES-256-GCM + PBKDF2-SHA256 (200k) for backups and for reading the txn backup

## Develop

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build → dist/
npm run preview     # serve the built app
npm run typecheck  # tsc --noEmit
npm run test       # vitest — pure compute unit tests
```

## Deploy (Vercel)

Push the repo and import it on Vercel (framework preset: **Vite**). `vercel.json` already adds
the SPA rewrite so deep links (e.g. `/buildings/:id`) resolve to `index.html`. Build command
`npm run build`, output `dist`. It runs on its own origin, separate from the transaction app.

## How money is modelled (no double-counting)

Two **separate** layers — see `src/lib/compute/`:

- **Worker balance (cash settlement):** `owed = wage (Σ dayFraction × wage effective on that date) +
  calculated food`; `paid = Σ assigned Wage/Advance/Food transactions`. Transport & Rent assigned to a
  worker are **provisions** and do **not** affect the balance.
- **Profit (accrual, cost-based):** per building `margin = OwnerReceipts − attendance labour`
  (labour comes from *attendance* at the wage effective on each date, never from wage payments).
  Business-wide `overhead = calculated food + Transport + Rent + Material + OtherExpense`.
  `Total profit = Σ margins − overhead`.
- **Food** is a *calculated* cost (per worker, by mode) — counted **once**, in overhead. A `Food`
  transaction is treated only as cash given to the worker (reduces balance), never re-added as cost.

Day-fraction = `0.5 × blocks worked`, capped at 1.5 (3rd block is OT at normal rate). **Food is
day-wise**, computed from the union of blocks worked that day: **breakfast needs blocks 1 & 2, lunch
needs blocks 2 & 3** (block 2 is required for any meal, so `{1,3}` earns nothing). **Wages are
effective-dated** — editing a worker's rate appends a `wageHistory` entry, so past work keeps its old
rate. **Statuses auto-advance** from dates on load / at midnight (`compute/status.ts` + `autoAdvance.ts`),
and mold payment status auto-derives from the bill vs. assigned owner receipts.

## Transaction-app sync — the one interop point ⚠️

`src/lib/crypto.ts → decryptFlexible()` is the **only** place that must agree with how your
transaction app wrote its encrypted export. It auto-detects the common shapes:

- a JSON envelope with `salt` / `iv` / `ciphertext` fields (also nested under `kdf`/`cipher`),
  base64 or hex, with an optional separate GCM `tag`; or
- a packed base64 blob of `salt | iv | ciphertext`.

`src/lib/sync.ts → extractConstruction()` parses the export's `{ categories, transactions }`: it finds
the top-level `Construction` category, maps each child sub-category **name → our type** via the
`categoryMap` (auto-matched on first sight; correct any in **Settings → Category mapping**), keeps the
Construction transactions, and keys everything on the transaction **`id` (UUID)** — never `slNo`. The
**passphrase is optional** (a plain-JSON backup is read directly), and `importFingerprint` carries an
assignment across if a transaction's id changes. A heuristic fallback handles older/unknown shapes.

If a real export does not decrypt or parse, adjust `CRYPTO_FIELD_NAMES` / `PACKED_LAYOUT` in
`crypto.ts` and the `*_KEYS` lists in `sync.ts` to match. Decryption happens **in memory only**;
only the Construction transactions are persisted.

## Backups & security

- **Settings → Backup** writes an encrypted `cwm-backup-v1` JSON of this app's whole database
  (same scheme as above), to a file or **Google Drive** (when configured). **Restore** replaces all
  data. Photos are stored as ~280px JPEG thumbnails to keep backups small.
- **Settings → App lock** sets a PIN (PBKDF2 hash, never stored in plaintext) plus optional
  **biometric unlock** (WebAuthn on web, a Capacitor biometric plugin on the APK; PIN stays as the
  fallback). The app re-locks after being backgrounded a couple of minutes.
- **Google Drive** is **built but dormant** until `VITE_GOOGLE_CLIENT_ID` / `VITE_OAUTH_REDIRECT_URL`
  are set; the offline file picker always works regardless. The **Android hardware back button** is
  wired to navigate history and exit only at a root tab.

## Project layout

```
src/
  lib/
    db.ts            Dexie schema (v2) + migration + seed
    types.ts         domain types
    crypto.ts        AES-GCM / PBKDF2 + flexible txn decryptor  ← interop point
    sync.ts          read txn backup → map categories → upsert Construction txns by UUID
    backup.ts        this app's encrypted backup / restore
    repo.ts          create/update helpers (ids, timestamps, wage history, categoryMap)
    hooks.ts         Dexie useLiveQuery hooks
    select.ts        selectors incl. buildingName() (derived names)
    autoAdvance.ts   status↔date auto-advance runtime
    native.ts        Capacitor (back button, app-state)   biometric.ts  WebAuthn / native unlock
    drive.ts         Google Drive (dormant until configured)
    compute/         shifts, food, wage, status, balance, profit, weekly  (pure, vitest-covered)
  components/        UI kit + shell (AppShell, BottomNav, BackButtonHandler, LockGate, …)
  screens/           Dashboard, Buildings, Molds, Workers, Owners, Attendance, Payments, settings/, Weekly, Settings
```
