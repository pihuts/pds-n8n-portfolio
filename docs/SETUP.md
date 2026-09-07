# Setup guide (both workflows) — ~20 minutes

Timezone assumed: Asia/Manila (already set in both workflow settings).

## 0. What you need
- An n8n instance (Cloud or self-hosted, v1.x / 2.x).
- A Google account (Gmail + Sheets + Drive consent once, reused by both workflows).
- For W2: a Telegram bot token (BotFather, free) and a Gemini API key
  (Google AI Studio, free tier is enough).

## 1. Google Sheet (shared by both workflows)
1. Create one Google Sheet, e.g. `PDS Automation`.
2. Create these tabs with the exact headers in row 1 (copy from
   docs/SHEETS_SCHEMA.md):
   - `Emails`, `Attachments`, `Receipts`, `Errors`
3. Copy the Sheet ID from the URL
   (`docs.google.com/spreadsheets/d/<THIS_PART>/edit`) — paste into the
   **Config** node field `sheetsDocId` in both workflows.

## 2. Google Drive folders
1. Create folder `PDS_Gmail_Attachments` (W1 root) and folder `PDS_Receipts`
   (W2 root) in My Drive.
2. Open each folder and copy the ID from the URL
   (`drive.google.com/drive/folders/<THIS_PART>`) — paste into the **Config**
   node field `driveParentId` of the matching workflow.

## 3. Gmail label (W1)
1. In Gmail: Settings > Labels > create label `PDS/Processed`.
2. Apply the labels you want polled (e.g. `label1`, `label2`, `label3`) to mail
   — or rename them in the **Config** node `labels` array.

## 4. Telegram bot (W2)
1. Message @BotFather > /newbot > copy the token.
2. In n8n: Credentials > New > Telegram API > paste token > Save.
3. Message your bot once (any text) so the chat exists.

## 5. Gemini key (W2)
1. Get a key at Google AI Studio (aistudio.google.com).
2. In n8n: Credentials > New > **Header Auth**:
   - Name: `x-goog-api-key`
   - Value: your Gemini API key
3. On the **Gemini Vision Extract** node, select that credential.
4. This works on BOTH n8n Cloud and self-hosted, and the key never appears
   in the workflow JSON, executions, or this package.

## 6. Import + connect + activate
1. n8n > Workflows > Import from File > select
   `workflows/workflow1_gmail_multi_label_to_sheets_drive.json`.
2. Open the **Config** node, fill the three IDs, Save.
3. Click each node showing a credential warning and select your OAuth
   credential (Gmail OAuth2 / Google Sheets OAuth2 / Google Drive OAuth2).
4. Execute once manually (Execute Workflow) with a labeled test email present,
   check the `Emails` tab, then toggle **Active**.
5. Repeat for `workflows/workflow2_telegram_receipt_gemini.json`, then send the
   bot a receipt photo.

## 7. Smoke test checklist
- W1: labeled email with attachment -> row in `Emails`, row(s) in
  `Attachments`, file at
  `PDS_Gmail_Attachments/<label>/<YYYY-MM-DD>/<Sender>/` with the ORIGINAL
  filename, email gains the `PDS/Processed` label.
- W1 rerun: no duplicate rows (message_id upsert), processed mail skipped.
- W2: receipt photo -> Telegram confirmation message, row in `Receipts`,
  photo at `PDS_Receipts/<YYYY-MM-DD>/`, resend same photo -> "already logged".
- W2 non-photo message -> usage instructions reply.
