# Google Drive Token Auto-Recovery — Architecture & Implementation Plan

## 1. Purpose

This document defines the recommended future changes for Daniel Skin Care so that Google Drive access-token expiry is handled automatically wherever possible, without asking the user to reconnect manually.

## 2. Cost constraint

The solution MUST use only the existing free/client-side stack:

- React + Vite
- Firebase Authentication already used by the project
- Google Identity Services (GIS) loaded from `accounts.google.com/gsi/client`
- Existing Google Drive API usage
- Existing browser `localStorage`

The implementation MUST NOT add:

- Firebase Cloud Functions / Cloud Run / another backend solely for token refresh
- A paid OAuth/token broker
- A new database or paid storage service
- A server-side stored Google refresh token

Important limitation: a browser-only SPA cannot guarantee silent recovery forever. If Google no longer permits silent authorization (for example, consent was revoked or the Google session/authorization state is unavailable), user interaction is still legitimately required. The target is therefore: automatic recovery for normal access-token expiry, with manual reconnect only for genuine re-authorization cases.

## 3. Current code state

The repository already contains most of the intended mechanism.

### Authentication

`src/firebase.js` configures `GoogleAuthProvider` with the `drive.file` scope.

### Silent Drive token acquisition

`src/auth/googleDrive.js` already loads GIS and calls:

`requestAccessToken({ prompt: "" })`

It returns a fresh access token and expiry information, or `null` when silent authorization is unavailable.

### Central token lifecycle

`src/auth/AuthProvider.jsx` already:

1. Stores the Drive access token in React state + a ref.
2. Tracks an internal refresh deadline.
3. Refreshes five minutes before expiry.
4. Performs a background check every 20 minutes.
5. Rechecks when the tab becomes visible or receives focus.
6. Shares concurrent refreshes through `refreshInFlightRef`.
7. Exposes `ensureDriveToken()` to consumers.
8. Falls back to explicit `reauthorizeDrive()` only when silent recovery fails.

### Drive upload / backup

`src/data/useDriveUpload.js` calls `ensureDriveToken()` before upload.

`src/data/useAutoBackup.js` also obtains the token at backup execution time rather than relying on an old token captured earlier.

`src/data/backup.js` uses the supplied token for Drive API operations and already handles stale/deleted backup-file IDs separately from authentication.

## 4. Recommended target architecture

Keep the current architecture and make the Drive token lifecycle a single, centralized service:

```
UI / backup / image upload
          |
          v
    ensureDriveToken()
          |
          +--> token still fresh --> return token
          |
          +--> token stale/missing
                    |
                    v
              silent GIS refresh
                    |
          +---------+---------+
          |                   |
       success              failure
          |                   |
          v                   v
     store token       mark reauth-required
          |                   |
          v                   v
       retry/use       manual reconnect only
```

No Drive consumer should directly read `driveToken` or implement its own refresh logic.

## 5. Required code rules

### Rule A — One token authority

`AuthProvider` remains the only owner of Drive-token state.

Do not add token refresh logic to:

- `backup.js`
- `photos.js`
- `useDriveUpload.js`
- individual screens

These modules should only request a valid token through `ensureDriveToken()`.

### Rule B — Always refresh immediately before Drive work

Every operation that calls Google Drive must obtain its token through `ensureDriveToken()` as close as practical to the API request.

This is already the pattern used by the backup and upload flows and should remain the standard.

### Rule C — Retry the Drive request once after an authentication failure

The future implementation should distinguish authentication failure from ordinary Drive failures.

Recommended behavior:

1. Send the Drive request with the current token.
2. If Drive returns an authentication failure (normally HTTP 401):
   - invalidate the locally cached token;
   - perform one silent GIS refresh;
   - retry the same Drive request once with the new token.
3. If the retry succeeds, the user sees no authentication error.
4. If silent refresh fails, expose a reconnect-required state.
5. Never retry indefinitely.

This protects against the case where the locally tracked expiry time is wrong or the token is invalidated earlier than expected.

### Rule D — Keep a single-flight refresh lock

Only one silent refresh may be active at a time.

The existing `refreshInFlightRef` in `AuthProvider.jsx` is the correct pattern and should remain the synchronization point.

Any future refactor must preserve this property.

### Rule E — Do not open a popup automatically

Do not call `signInWithPopup()` from:

- timers
- `useEffect`
- `setTimeout`
- Drive API error handlers
- background backup
- silent refresh code

Browsers may block such popups because they are not directly caused by a user gesture.

`reauthorizeDrive()` must remain an explicit user-action path.

## 6. Recommended file changes

### 6.1 `src/auth/googleDrive.js`

Keep GIS as the free browser-side token provider.

Recommended future changes:

- Rename `silentDriveToken` to a name that makes its behavior explicit, such as `requestSilentDriveToken`.
- Keep the GIS script loading promise.
- Keep a single token-client instance.
- Keep the timeout so a blocked/unavailable GIS flow cannot hang the application.
- Normalize errors into a small internal result shape instead of exposing GIS-specific details to UI code.
- Document clearly that `prompt: ""` is silent only when Google can satisfy the authorization from the existing browser session/consent.

Do not add a refresh-token endpoint or backend service.

### 6.2 `src/auth/AuthProvider.jsx`

This is the main architecture point.

Recommended changes:

- Keep `driveTokenRef` as the immediate token source.
- Keep the five-minute safety buffer.
- Keep proactive background refresh.
- Keep refresh on tab visibility/focus.
- Keep the single-flight refresh lock.
- Add an explicit internal `invalidateDriveToken()` helper.
- Add a centralized `withDriveToken(operation)` helper if practical.

Desired conceptual API:

```js
const result = await withDriveToken(async (token) => {
  return callDriveApi(token);
});
```

The helper should:

1. obtain a valid token;
2. execute the operation;
3. detect HTTP 401;
4. invalidate the token;
5. silently refresh once;
6. retry once;
7. surface a reconnect-required error only if silent recovery is unavailable.

This prevents each Drive consumer from having to implement retry logic independently.

### 6.3 `src/data/useDriveUpload.js`

Keep this hook focused on upload UX.

Change its responsibility from:

- obtain token;
- call upload;
- manually reconnect after token failure

to:

- call the centralized Drive operation/token service;
- retry automatically when the service reports an expired token;
- show the reconnect action only when silent recovery genuinely failed.

The existing `retry()` behavior for network/Drive errors should remain separate from authentication recovery.

### 6.4 `src/data/backup.js`

Do not put OAuth refresh logic here.

Recommended future refactor:

- Move raw authenticated Drive fetches behind the centralized Drive request helper.
- Keep the existing backup-file recovery logic:
  - stored file ID;
  - 404 handling;
  - search by `daniel-skin-care-backup.xlsx`;
  - create new file when required.
- Preserve `BackupError.status` and `BackupError.detail`.

This keeps two different failure classes separate:

- authentication/token failure;
- backup-file/resource failure.

### 6.5 `src/data/useAutoBackup.js`

Keep the existing behavior of obtaining the token at execution time.

Recommended future behavior:

- Let the centralized Drive request layer perform silent token recovery.
- Do not make automatic backup open authentication UI.
- If silent authorization is unavailable, record `no-token` / reconnect-required and allow the next scheduled/manual run to try again.
- Keep `force=true` behavior unchanged for explicit "Backup now".

## 7. Token state model

Use explicit states internally:

- `unknown` — application has not checked Drive authorization yet.
- `ready` — valid access token is available.
- `refreshing` — silent GIS refresh is running.
- `reauth_required` — silent authorization failed and user interaction is genuinely required.
- `signed_out` — no Firebase user.

Do not equate "access token expired" with "user must reconnect".

The first condition should trigger silent recovery.

Only the second should trigger the reconnect UI.

## 8. Error classification

### Automatic recovery

These cases should be retried automatically:

- locally expired access token;
- token near expiry;
- Drive returns HTTP 401 for an otherwise valid operation;
- tab was inactive and the previous token expired while backgrounded.

### No automatic retry

These should not be treated as token refresh problems:

- HTTP 403 caused by Drive permissions/quota;
- HTTP 404 caused by a deleted backup file;
- malformed request;
- network outage;
- invalid file data;
- Google API service errors unrelated to authentication.

### Manual reconnect

Only use the explicit reconnect UI when silent GIS authorization cannot produce a new token.

Examples include:

- Google authorization/consent was revoked;
- the Google session needed for silent authorization is unavailable;
- the OAuth client/origin configuration is invalid;
- GIS reports an authorization error that requires user interaction.

## 9. Security requirements

Do not store Google access tokens in `localStorage`.

The existing access token should remain in runtime memory only.

It is acceptable to keep the Drive backup file ID in `localStorage`, as the current code does, because it is not an OAuth credential.

Do not introduce a client-side stored Google refresh token.

Do not expose OAuth secrets in Vite environment variables. A Web OAuth Client ID is not a secret; a client secret must never be shipped to the browser.

## 10. Configuration requirements

The existing `VITE_GOOGLE_CLIENT_ID` approach should remain.

Before implementation, verify that:

1. The configured value is the intended Google Web OAuth Client ID.
2. The production origin is listed under Authorized JavaScript origins.
3. The development origin(s), such as localhost, are listed when local testing is required.
4. The OAuth client is compatible with the Firebase/Google sign-in configuration already used by the application.
5. The `drive.file` scope remains enabled and requested consistently.

A configuration mismatch must be surfaced as a configuration error, not misclassified as a generic network failure.

## 11. UX requirements

Normal token expiry must be invisible to the user.

Expected experience:

- User opens the application.
- User signs in normally.
- Drive access works.
- After approximately one hour, the original Drive access token may expire.
- The application silently obtains a new token.
- Upload/backup continues without a popup.
- No "connect Google Drive" dialog appears.

Only when Google requires fresh authorization should the UI show:

"יש צורך להתחבר מחדש ל-Google Drive"

with an explicit reconnect button.

## 12. Testing plan

### Test A — Normal expiry

1. Sign in with Google.
2. Confirm a Drive token exists.
3. Force the application to treat the token as expired.
4. Trigger upload.
5. Verify GIS silently returns a new token.
6. Verify upload succeeds without popup.

### Test B — Expired token during an active request

1. Start a Drive request using a token that will fail.
2. Return HTTP 401.
3. Verify exactly one silent refresh occurs.
4. Verify the original operation is retried once.
5. Verify success does not display reconnect UI.

### Test C — Concurrent requests

Start several Drive operations simultaneously with an expired token.

Expected:

- one refresh request;
- all operations wait for the same promise;
- all use the new token;
- no callback race;
- no false `driveNeedsReauth`.

### Test D — Revoked consent

Make silent authorization fail.

Expected:

- no popup is opened automatically;
- `reauth_required` state is set;
- explicit reconnect button remains available;
- after user reconnects, the failed operation can be retried.

### Test E — Deleted backup file

Delete `daniel-skin-care-backup.xlsx`.

Expected:

- authentication remains healthy;
- backup handles 404 as a resource problem;
- the old ID is cleared;
- an existing matching file is found or a new one is created.

### Test F — Network failure

Block Drive network requests.

Expected:

- no reconnect popup;
- error classified as network/Drive failure;
- retry remains available.

## 13. Acceptance criteria

The implementation is complete when all of the following are true:

- No new paid service is introduced.
- No backend is required for token refresh.
- No Google refresh token is stored in the browser.
- All Drive operations obtain credentials through one centralized token path.
- Normal access-token expiry is recovered silently.
- A Drive 401 causes at most one silent refresh and one request retry.
- Concurrent refreshes are single-flight.
- Background refresh never opens a popup.
- Automatic backup never opens a popup.
- Manual reconnect is shown only after silent recovery fails.
- Existing backup-file 404 recovery continues to work.
- Existing smart-backup behavior continues to work.
- No user data is lost when authentication recovery fails.
- Production build continues to use only the current React/Vite/Firebase/Google stack.

## 14. Implementation order

Recommended future implementation sequence:

1. Refactor `googleDrive.js` result/error handling without changing behavior.
2. Add `invalidateDriveToken()` to `AuthProvider.jsx`.
3. Add centralized `withDriveToken()` / authenticated Drive request helper.
4. Move Drive 401 detection/retry into that helper.
5. Migrate `backup.js` to the helper.
6. Migrate `photos.js` / `useDriveUpload.js` to the helper.
7. Keep `useAutoBackup.js` on the same path.
8. Verify manual reconnect remains only the final fallback.
9. Run the test matrix above.
10. Only after all tests pass, remove any now-redundant per-consumer authentication handling.

## 15. Explicit non-recommendations

Do NOT implement any of the following for this project:

- paid OAuth/token management services;
- a new server solely to hold/refresh Google tokens;
- Firebase Functions solely for token refresh;
- Cloud Run solely for token refresh;
- storing a Google refresh token in `localStorage`;
- automatically opening a Google popup from a timer or background task;
- duplicating token refresh logic across upload/backup screens.

## 16. Current-state conclusion

The project is already significantly aligned with the target design: GIS silent refresh, proactive refresh, focus/visibility refresh, and a single-flight refresh lock are present.

The main future work is therefore not to replace the authentication architecture, but to finish centralizing authenticated Drive requests so that a real HTTP 401 also triggers the same silent-refresh-and-retry path. This closes the remaining gap between "we know the token is about to expire" and "Google has actually rejected the token".

The solution intentionally remains browser-only and uses the project's existing free stack.
