# /upload — call upload workflow

`/upload` is the one create-upload screen. `/call-library?tab=upload` is the upload history/status list; the uploader is not duplicated there.

## Contract (unchanged)
`POST /v1/upload/signed` → `PUT` to the signed storage URL → `POST /v1/upload/finalize` → poll `GET /v1/jobs/:id` and `GET /v1/calls/:id`.
The finalise body is `{ path, filename, mime, size, accountId }`. Nothing else is sent: the API reads only `path`, `filename`, `mime`, `size`,
`sha256` and `accountId` (gravix-sales-trainer-api `src/server.ts`, `/v1/upload/finalize`). `profileLabel`, `companyTag` and `callType` were
previously sent but are ignored server-side, so the UI no longer asks for them.

## Ownership and visibility
* The call is owned by the **signed-in uploader** (`calls.user_id` = caller). The page says so and offers no rep selector.
* Visibility is a separate concept: the uploader can always open it; others in the same organisation per the organisation's call-visibility
  setting; nobody outside the organisation.
* The recording is the only required input. The one optional field is the client **account** link (`accountId`, honoured by the API).

## Limits (verified)
* 50 MB per file — the API's `MAX_UPLOAD_BYTES`. Staging bucket `staging-call-audio` has `file_size_limit = 52428800` (exactly 50 MiB) and the same
  allowed-MIME list as the API (read-only check, 2026-11-05). The project-wide storage limit was not read (needs a Management API token); a bucket
  limit cannot exceed it, so 50 MiB is permitted. No large object was uploaded.
* Types: WAV, MP3, M4A, MP4, AAC, OGG, WebM, FLAC audio, or a transcript as `.json`.

## Retry, leave and resume behaviour
* Upload failure → nothing saved → a retry starts a fresh transfer (no call exists yet).
* Finalise failure → the file is already stored → a retry skips the transfer; if the earlier finalise had actually created the call (id is derived from
  the storage path) the retry adopts it, so no duplicate call is created.
* Processing failure → "Check again" only polls; it never uploads or finalises again.
* Refresh/return during processing resumes the same call (`sessionStorage`, 2 h, strictly validated).
* While the recording is still travelling (preparing / uploading / finalising): reload and tab close use `beforeunload`; in-app links ask first; browser
  **Back** is guarded by ONE sentinel history entry pushed when the transfer starts and removed when it stops being active (history depth is unchanged
  before/after). Staying re-arms exactly one entry (no growth, no loop); a confirmed leave removes the sentinel first so no duplicate `/upload` entry is
  left behind. Once processing starts the guard is gone and Back leaves normally.

## Backend / product requirement (NOT implemented here)
**"Manager uploads on behalf of a rep."** Needs an authenticated API contract that accepts a target rep on `/v1/upload/signed` + `/v1/upload/finalize`,
validates that the rep belongs to the **manager's organisation** (and that the caller is a manager), and records the correct owner (`calls.user_id`,
storage path prefix, hierarchy) server-side. Until it exists the UI must not offer a rep selector.
Related: `callType` and tag/campaign are also not persisted by finalise; if they are wanted they need columns and an API contract first.

## Verification status
Mocked Playwright (`tests/e2e/glass-upload.spec.ts`) and unit tests (`tests/unit/upload-model.test.mts`) only. Real staging upload, storage progress, transcription
and scoring timing are not yet verified.
