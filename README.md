# PDS n8n Assessment Portfolio

n8n workflows for the Precision Data Solutions assessment:

- **Workflow 1 — Multi-Label Gmail to Google Sheets & Drive.** Polls a Gmail
  inbox on a schedule for incoming mail under multiple labels, logs sender
  details to a Google Sheet, and saves attachments to Drive with their
  original filenames, grouped in folders by label / date received / sender.
- **Workflow 2 — Telegram Receipt Photo Processing.** Accepts receipt photos
  via a Telegram bot, extracts merchant / amount / date (and more) with
  Google Gemini, logs them to a Google Sheet, and saves the original photo
  to Drive grouped by submission date.

## Repository layout

```
workflows/
  workflow1_gmail_multi_label_to_sheets_drive.json   W1: Gmail -> Sheets + Drive
  workflow2_telegram_receipt_gemini.json             W2: Telegram -> Gemini -> Sheets + Drive
docs/
  SETUP.md            step-by-step: credentials, IDs, sheet tabs, activation
  SHEETS_SCHEMA.md    exact tab + header layouts to create
  ARCHITECTURE.md     design decisions, data flow, idempotency, failure handling
  TEST_REPORT.md      what was tested, how, results, known limits
  SUBMISSION_EMAIL.md ready-to-send reply for the HR thread
  SUBMISSION_EMAIL.txt short plain-text version of the same reply
config/
  .env.example        template for the single secret (Gemini key, added as an
                      n8n Header-Auth credential - never stored in the workflows)
tests/
  test_workflows.js   structural validation of both workflow JSONs
  test_code_nodes.js  unit tests executing the real Code-node JavaScript
  test_vision_spark.js  live vision test: feeds a model reply through the real
                      Parse code and asserts the extracted receipt (5 checks)
  fixtures/           sample receipts used in the tests
```

## Quick start

1. Read `docs/SETUP.md` (15-20 min, mostly clicking through the Google and
   Telegram consoles).
2. In n8n: **Import from File**, pick a workflow JSON, fill in its Config
   node (Sheet ID, Drive folder ID), connect the credentials, Activate.
3. Send a test email / receipt photo and watch the first execution.

## Secrets

No secrets are stored in this package. The Gemini API key is added in the
n8n UI as a Header-Auth credential (header name `x-goog-api-key`) and
selected on the Gemini node - works on n8n Cloud and self-hosted, no env
vars required. The Telegram token lives in the n8n Telegram credential.

## Tests

Run from the repo root (Node.js 18+, no extra packages needed):

```
node tests/test_workflows.js     # structural checks
node tests/test_code_nodes.js    # unit tests for the Code nodes
node tests/test_vision_spark.js <model-reply-file>   # live vision chain
```
