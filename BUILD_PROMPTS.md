# Centring Work Manager — Build Prompt: Encrypted Google Drive Backup + Google Sign-In

Paste everything between **PROMPT START** and **PROMPT END** to the AI building the Centring Work Manager app.
Architecture: one shared app Client ID (env var), each user signs in with their own Google account, and their data is encrypted on-device and stored in a hidden, app-private folder in *their own* Drive.

---

**PROMPT START**

Implement **Google Sign-In + encrypted personal backup to the user's own Google Drive**, using this exact architecture. Goal: a single app-level Google OAuth Client ID (shared by all users, stored in an env var), where each user authenticates with their own Google account and their data is encrypted on-device and stored in a hidden, app-private folder in *their own* Drive. The developer must never be able to read user data.

## Core principles (do not deviate)

1. **One Client ID for the whole app.** It identifies the *app*, not the user. Store it in an env var (e.g. `VITE_GOOGLE_CLIENT_ID`). Users never enter their own ID.
2. **No Client Secret in the app.** Use the OAuth token (implicit) flow with `response_type=token`. Only the public Client ID ships in the client bundle — that is safe.
3. **Per-user storage in `appDataFolder`.** Request the `https://www.googleapis.com/auth/drive.appdata` scope. Backups go to Drive's hidden, app-specific `appDataFolder` in each user's own Drive. The app can only see files it created; the user doesn't see them in their normal Drive UI.
4. **Client-side encryption.** Encrypt the whole backup with AES-256-GCM using a key derived from a user passphrase via PBKDF2-SHA256 (200,000 iterations). The passphrase is NEVER stored or transmitted — it stays in memory / must be re-typed. This guarantees the developer cannot read the data even though it is in Drive.
5. **Access token is in-memory only.** Never persist the OAuth access token to disk/localStorage. Re-acquire on expiry.

## OAuth scopes

```
openid email profile https://www.googleapis.com/auth/drive.appdata
```

## Two sign-in code paths

**Web (browser / PWA):** Use Google Identity Services (GIS) token client.
- Load `https://accounts.google.com/gsi/client`.
- `google.accounts.oauth2.initTokenClient({ client_id, scope, callback })`.
- Call `requestAccessToken({ prompt: '' })`; the callback returns `access_token` + `expires_in`. Store both in memory.

**Android (Capacitor WebView):** GIS refuses to run inside embedded WebViews, so:
- Open Google's OAuth URL in a real Chrome Custom Tab via `@capacitor/browser`:
  `https://accounts.google.com/o/oauth2/v2/auth` with params `client_id, redirect_uri, response_type=token, scope, state, prompt=consent, include_granted_scopes=true`.
- `redirect_uri` points to a small hosted HTML page (e.g. on Vercel) `oauth-redirect.html` that reads the `#access_token=...` fragment and forwards it to a custom-scheme deep link: `com.yourapp.app://oauth-success#access_token=...`.
- Listen for that deep link with `@capacitor/app`'s `appUrlOpen`. Validate `state` (CSRF), extract `access_token` + `expires_in`, then `Browser.close()`.

After either flow, fetch user info from `https://www.googleapis.com/oauth2/v3/userinfo` with `Authorization: Bearer <token>` to get `sub, email, name, picture`.

## Drive REST calls (all against `appDataFolder`)

Reuse the same access token from sign-in (the `drive.appdata` scope was already granted, so there's no separate "Connect Drive" step). Wrap fetches in a helper that, on a `401`, attempts a silent re-auth once then retries.

- **Find backup:**
  `GET https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name='<FILE>' and trashed=false&fields=files(id,name,modifiedTime,size)`
- **Upload (multipart):** if the file exists `PATCH` it (metadata `{ name }`), else `POST` a new one (metadata `{ name, parents: ['appDataFolder'] }`).
  `POST/PATCH https://www.googleapis.com/upload/drive/v3/files[/<id>]?uploadType=multipart&fields=id,modifiedTime,size`
  Body is `multipart/related`: part 1 = JSON metadata, part 2 = the encrypted envelope JSON.
- **Download:** `GET .../drive/v3/files/<id>?alt=media`.
- **Delete:** `DELETE .../drive/v3/files/<id>`.

Use a single fixed filename, e.g. `myapp-backup.json.enc`, and always overwrite the one backup file.

## Encryption envelope (client-side, Web Crypto API)

Derive key:
```
PBKDF2( passphrase, salt, iterations=200000, hash=SHA-256 ) -> AES-GCM 256-bit key
```
Encrypt `JSON.stringify(payload)` with AES-256-GCM using a fresh 12-byte IV and 16-byte salt. Output envelope (base64 fields):
```json
{
  "v": 1,
  "alg": "AES-256-GCM",
  "kdf": "PBKDF2-SHA256",
  "iter": 200000,
  "salt": "<b64>",
  "iv": "<b64>",
  "ct": "<b64>"
}
```
Decrypt reverses it; a failed `crypto.subtle.decrypt` means wrong passphrase or corrupt file. Enforce a minimum passphrase length (>= 8). Optionally support plain (unencrypted) JSON too — detect by presence of `data` key and absence of `alg`.

## Safety/UX details to include

- **Passphrase verification before overwrite:** since no "correct" passphrase is stored, before overwriting an existing encrypted backup, download it and attempt to decrypt with the entered passphrase. If it fails, abort (prevents a typo from locking the next backup). If nothing exists yet, treat as first backup and ask the user to re-type the passphrase.
- **Token expiry:** store `expiresAt`; treat the token invalid ~5s early. On web, silent re-auth via GIS; on Android, expired = prompt the user to sign in again.
- **Sign-out:** revoke the token (web: `google.accounts.oauth2.revoke`) and clear in-memory token + user info.
- **Common Drive errors:** surface a clear hint if `403 accessNotConfigured/SERVICE_DISABLED` (Drive API not enabled for the Cloud project) or `403 insufficient` (missing `drive.appdata` scope → sign out and back in).

## Google Cloud Console setup (document for me)

1. Create one OAuth 2.0 Client ID (type: Web application for the GIS/web flow; the same Client ID's redirect URI is reused by the Android Custom-Tab flow).
2. Add authorized JavaScript origins (your web origin) and the redirect URI (`https://<your-host>/oauth-redirect.html`).
3. **Enable the Google Drive API** for the project.
4. Configure the OAuth consent screen with the scopes above.
5. Put the Client ID in env (`VITE_GOOGLE_CLIENT_ID`) and the redirect URL in env (`VITE_OAUTH_REDIRECT_URL`).

## Deliverables

Please produce, adapted to my app's stack:
- `googleAuth` module (web GIS flow + Android Custom-Tab/deep-link flow, in-memory token, userinfo fetch, sign-out).
- `drive` module (find/upload/download/delete against `appDataFolder`, with 401 retry).
- `crypto` module (AES-256-GCM + PBKDF2 encrypt/decrypt envelope).
- `backup` orchestrator (`dumpAll` → encrypt → upload; download → decrypt → restore; plus the pre-overwrite passphrase verification).
- The hosted `oauth-redirect.html` forwarding page for the Android deep-link flow.

Use my app's existing storage layer for the data being backed up; keep the Client ID/secret handling and the "encrypt before it ever leaves the device" guarantee exactly as described.

**PROMPT END**
