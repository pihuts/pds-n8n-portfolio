Hi Ms. Barriga,

Thank you for the opportunity to take on this assessment. I have completed the Official Application Form, and my portfolio for both workflows is attached to this reply.

WORKFLOW 1 — Multi-Label Gmail to Google Sheets & Drive

- Automatically checks the inbox every 15 minutes (interval configurable) using a single Gmail query that covers all configured labels (label1, label2, label3, etc.) and skips already-processed mail, so each run only handles new mail.
- Processes each email and extracts key sender information — sender name, email address, subject, date received, matching label, and subject snippet — inserting it into the "Emails" tab of a Google Sheet. Rows are keyed by Gmail message ID, so retried or repeated runs never create duplicates.
- If attachments are found, they are downloaded to Google Drive with each attachment retaining its original filename, and logged in the "Attachments" tab.
- Attachments are grouped in folders by label and date received, with the folder name set to the sender's name: PDS_Gmail_Attachments/<Label>/<YYYY-MM-DD>/<Sender Name>/ — each folder level is created only when it doesn't already exist.

WORKFLOW 2 — Telegram Receipt Photo Processing

- Accepts receipt photos sent via a Telegram bot. Non-photo messages get a friendly usage reply, and an oversize guard (15 MB) keeps bad inputs from entering the pipeline.
- Each photo is processed with Google Gemini (2.0 Flash, JSON mode) to extract the key details: merchant name, amount, currency, receipt date, category, and line items — plus a confidence score. Low-confidence results are flagged for review rather than silently trusted.
- Extracted data is inserted into the "Receipts" tab of the same Google Sheet, keyed by the Telegram file ID so re-sent photos are detected as duplicates instead of double-counted.
- The original photo is saved to Google Drive under PDS_Receipts/<YYYY-MM-DD>/, grouped in folders by submission date, and the bot replies on Telegram with a confirmation (or a review request when it isn't fully sure about a receipt).

WHAT'S IN THE ATTACHED PACKAGE (PDS_n8n_Portfolio.zip)

- workflows/ — both import-ready n8n workflow .json files, validated by import into n8n 2.37.10. They ship inactive with placeholder credentials, and no secrets are embedded anywhere (the Gemini key is added in the n8n UI as a Header-Auth credential, never stored in the workflow files).
- docs/ — SETUP.md (a ~20-minute setup guide plus a smoke-test checklist), SHEETS_SCHEMA.md (the exact sheet tabs and headers to create), ARCHITECTURE.md (design decisions: dedupe keys, folder-creation logic, failure handling, retry behavior), and TEST_REPORT.md (test coverage and results).
- tests/ — runnable structural validators and unit tests covering the workflow logic, plus the sample receipt images used in the live vision tests. In testing, receipts ranging from a modern German grocery receipt to a faded 1994 Tesco thermal receipt and a handwritten restaurant bill were all read back correctly (merchant, amount, date) — details in TEST_REPORT.md.

Setup on your side is minimal: import both workflow files into n8n, paste the Sheet and Drive folder IDs into each workflow's Config node, connect Google/Telegram credentials, add the Gemini API key as a Header-Auth credential, and activate. All steps are in docs/SETUP.md.

I would be glad to walk through either workflow live, or to adjust anything — poll interval, extracted fields, folder layout — in the next stage.

Best regards,
[Your Name]
[Mobile] · [LinkedIn/Portfolio/GitHub — if any]
