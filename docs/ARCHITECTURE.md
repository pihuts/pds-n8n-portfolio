# Architecture notes

## W1 — Multi-Label Gmail to Sheets & Drive (poll, every 15 min)
Schedule -> Config -> Build Gmail Query -> Gmail Fetch -> IF Found ->
Extract Email Fields -> Sheets Find Existing -> IF Is New ->
Sheets Log Email (upsert) -> IF Has Attachments -> Split Attachments ->
+- Unique Folder Paths -> Loop Over Paths (batch 1) -> per level:
|   Search -> IF exists? -> Create -> Attach ID ... (Label/Date/SenderName)
|   -> Emit Folder Mapping -> loop back; done ->
+- Wait For Folders (Merge barrier) -> Attach Folder ID -> Drive Upload ->
IF Upload OK -> Sheets Log Attachment (upsert) -> Gmail Mark Processed.
Duplicates (already-seen message_id) skip straight to Mark Processed.

Why one Gmail query instead of a per-label loop: a single
`newer_than:1d (label:a OR label:b) -label:(PDS/Processed)` call is cheaper,
atomic per poll, and needs no loop state. Labels remain data (Config array),
not workflow structure — adding label4 is a one-line edit.

Why the folder loop runs batchSize 1: n8n emits a single ambiguous ghost item
only when a search returns zero rows overall; with one path in flight, every
lookup result (found or ghost) maps unambiguously back to its path, so
search-then-create at each of the three levels is exact and duplicate folders
are never created. Verified against the n8n-core execution source.

Why the Merge barrier: Google nodes replace items and drop binaries, so
attachment bytes travel a wire that never touches a Google node; the folder
loop runs on a parallel wire. Merge/append waits for both, and the join Code
matches folder ids to attachments by exact path. Binaries are forwarded only
through Code nodes, which preserve them.

Idempotency: email rows upsert on message_id, attachment rows upsert on
(message_id, filename). Only fully-handled mail receives PDS/Processed, so a
failed run is retried on the next poll without duplicating rows.

## W2 — Telegram Receipt Photo Processing (event-driven)
Trigger(photo) -> Config -> IF Is Photo -> Extract Meta (largest size, 15 MB
cap) -> IF Too Large -> Sheets Find Receipt (dedupe on file_unique_id) ->
IF Is New -> Search/Create Date Folder -> Emit -> Telegram Get File ->
Photo to Base64 -> Attach Folder ID -> Drive Upload (original bytes) ->
IF Upload OK -> Gemini Vision (HTTP, JSON mode, temp 0.1) ->
Parse Receipt JSON -> Sheets Append (upsert) -> IF Needs Review ->
Telegram Confirm / Review / Duplicate / Usage / TooLarge replies.

Ordering rationale: dedupe happens before any download (free resend guard);
the Drive folder is ensured before download so the binary chain
Get File -> Base64 -> Attach -> Upload never crosses a JSON-replacing node
except Code nodes, which forward binaries intact. The photo bytes uploaded are
exactly what Telegram delivered; only the filename is namespaced
(<date>_<messageid>.<ext>) to avoid collisions — the extension and bytes are
original.

Gemini via plain HTTP (not a LangChain node): the request/response is fully
visible, version-pinned (gemini-2.0-flash), uses response_mime_type JSON,
sends the key as the x-goog-api-key header via a Header-Auth credential, and
needs no extra community nodes. The Parse node never throws on model noise —
it strips fences, extracts the first {...}, coerces amount/currency/date/
confidence, and flags needs_review instead of failing.

Secrets: Gemini key via an n8n Header-Auth credential (header
x-goog-api-key) selected on the HTTP node — works on Cloud and self-hosted,
no env vars needed. Telegram token via the n8n Telegram credential. Neither
appears in the JSON, executions, or this package.

## Failure handling (both)
- continueOnFail on every cloud call; failures route to the Errors tab.
- W1: only success gets PDS/Processed -> automatic retry next poll.
- W2: upload failure -> error row + no Gemini spend; low confidence ->
  row saved WITH needs_review flag + honest Telegram reply (never silent).
- All Sheet writes are upserts on stable keys -> retries are row-safe.
