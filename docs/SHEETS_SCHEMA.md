# Google Sheet schema — one spreadsheet, four tabs
Create the header row (row 1) exactly as listed. Types are enforced by the
workflows' column mappings; keep header spelling/case identical.

## Tab: Emails  (W1 — one row per email, keyed by message_id)
| header           | type   | notes                                    |
|------------------|--------|------------------------------------------|
| message_id       | string | Gmail message id — dedupe/upsert key     |
| date_received    | string | YYYY-MM-DD (sender's Date header)        |
| label            | string | which polled label matched               |
| sender_name      | string | display name (or address if none)        |
| sender_email     | string | lowercased                               |
| subject          | string |                                          |
| snippet          | string | first 300 chars                          |
| attachment_count | number | binaries found on the message            |
| drive_folder_path| string | <label>/<date>/<Sender>                  |
| processed_at     | string | ISO timestamp of this run                |

## Tab: Attachments  (W1 — one row per file, keyed by message_id+filename)
| header         | type   | notes                                      |
|----------------|--------|--------------------------------------------|
| message_id     | string | parent email — part of upsert key          |
| filename       | string | ORIGINAL attachment filename — part of key |
| mime_type      | string |                                            |
| label          | string |                                            |
| date_received  | string | YYYY-MM-DD                                 |
| sender_name    | string |                                            |
| drive_file_id  | string | Drive file id                              |
| drive_link     | string | webViewLink                                |
| processed_at   | string | ISO timestamp                              |

## Tab: Receipts  (W2 — one row per photo, keyed by file_unique_id)
| header           | type    | notes                                        |
|------------------|---------|----------------------------------------------|
| submission_date  | string  | YYYY-MM-DD (message date, Manila tz)         |
| telegram_user    | string  | first+last or @username                      |
| merchant         | string  | from Gemini (`Unknown` if unreadable)        |
| amount           | number  | grand total, plain number                    |
| currency         | string  | 3-letter, default PHP                        |
| receipt_date     | string  | YYYY-MM-DD as printed (falls back to submit) |
| category         | string  | Food/Transport/Office/Utilities/Healthcare/Shopping/Other |
| items            | string  | up to 8 items, `; `-joined                   |
| confidence       | number  | 0–1 model self-score                         |
| needs_review     | boolean | true when merchant/amount missing or conf < 0.6 |
| drive_link       | string  | photo webViewLink                            |
| file_unique_id   | string  | Telegram id — dedupe/upsert key              |
| notes            | string  | model note (max 300 chars)                   |
| processed_at     | string  | ISO timestamp                                |

## Tab: Errors  (both workflows — append-only ops log)
| header     | type   | notes                              |
|------------|--------|------------------------------------|
| timestamp  | string | ISO                                |
| workflow   | string | which workflow failed              |
| node       | string | node that raised                   |
| message_id | string | email id / telegram message id     |
| error      | string | error message                      |
