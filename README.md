PDS n8n Portfolio — Gmail/Telegram Automation
================================================
Candidate assessment for Precision Data Solutions Corp.
Deadline: 4:00 PM, Monday, September 7, 2026.

Contents
--------
workflows/
  workflow1_gmail_multi_label_to_sheets_drive.json   W1: Gmail -> Sheets + Drive
  workflow2_telegram_receipt_gemini.json             W2: Telegram -> Gemini -> Sheets + Drive
docs/
  SETUP.md            step-by-step: credentials, IDs, tabs, env vars, activation
  SHEETS_SCHEMA.md    exact tab + header layouts to create
  ARCHITECTURE.md     design decisions, data flow, idempotency, failure handling
  TEST_REPORT.md      what was tested, how, results, known limits
  SUBMISSION_EMAIL.md ready-to-send reply for the HR thread
config/
  .env.example        template for the single secret (Gemini key -> n8n
                      Header-Auth credential, never in the workflows)
tests/
  test_workflows.js   structural validation vs installed n8n 2.37.10
  test_code_nodes.js  unit tests executing the REAL Code-node JS
  test_vision_spark.js  live vision test: feeds a model reply file through
    the REAL Parse code and asserts the receipt (5 checks). Produce the
    reply with any vision model you have (e.g. an agent-CLI one-shot with
    --image tests/fixtures/receipt_sample.png and the prompt in
    tests/fixtures/vision_prompt.txt), save it to a file, then:
    node tests/test_vision_spark.js <reply-file>
  (a TEST-ONLY W2 variant lives in the repo folder but is EXCLUDED from
  the submission zip)
  fixtures/receipt_sample.png  synthetic receipt used for the vision test

Quick start
-----------
1. Read docs/SETUP.md (15-20 min, mostly clicking through Google/Telegram consoles).
2. In n8n: Import from File -> pick the workflow JSON -> fill Config node ->
   connect credentials -> Activate.
3. Send a test email / receipt photo and watch the first execution.

No secrets are stored in this package. The Gemini key is added in the n8n UI
as a Header-Auth credential (x-goog-api-key) — Cloud and self-hosted both
work, no env vars required. The Telegram token lives in the n8n Telegram
credential. Nothing to scrub before sharing.
