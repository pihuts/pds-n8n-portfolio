# Test report — 2026-09-06 (all green)

Harness: `node tests/test_workflows.js` and `node tests/test_code_nodes.js`.
Engine cross-check: local n8n 2.37.10 (`npm i n8n@2.37.10`), node operation
names/params verified against the installed `n8n-nodes-base` sources
(Gmail v2 ops, Sheets v4 resource/filters, Drive v2 upload/search/create
params, Telegram resources, SplitInBatches v3 output order, Merge v3 modes,
alwaysOutputData ghost semantics in n8n-core).

## 1. Structural validation — PASS (all checks, both files)
- Valid JSON; ships inactive; timezone Asia/Manila.
- Every node type+typeVersion exists in n8n 2.37.10; every connection target
  resolves; output indexes valid (IF=2, Loop=2); no orphan nodes.
- All credentials are empty-id placeholders. Secret scan: no `sk-` keys, no
  `AIza` keys, no Telegram `id:hash` tokens anywhere in the package.
  (no keys anywhere; W2 reads the Gemini key from a Header-Auth credential at runtime).

## 2. Import test (real n8n) — PASS
- `n8n import:workflow` succeeds for both files ("Successfully imported
  1 workflow" x2). (First attempt caught a missing top-level `id`, fixed.)

## 3. Code-node unit tests — 24/24 PASS
W1: multi-label query builder (array + string configs); From-header parsing
(quoted display name, bare address, illegal filename chars sanitized);
attachment count + binary passthrough; per-file fan-out keeps ORIGINAL
filenames; path dedupe; loop rehydration codes; Merge-barrier join keeps
binaries and drops mapping items.
W2: largest photo selected, user composed, submission date, 15 MB oversize
flag; Parse handles fenced JSON, noisy prose with partial fields (defaults +
needs_review), percent-scale confidence, and empty model replies without
throwing.

## 4b. Real internet files (live vision model) — PASS 3/3
Sources (Wikimedia Commons, freely licensed): `Grocery Store Receipt in
Vienna.jpg`, `Tesco grocery receipt Finchley 1994.jpg`, and a Hong Kong
Shanghai-restaurant cash bill (July 2021) — saved under
tests/fixtures/real_*.jpg with ground truth read independently first.
- Vienna (crumpled German receipt): HOFER KG, 22.41 EUR, 2024-03-25,
  8 items, conf 0.96, no review. CORRECT.
- Tesco 1994 (faded thermal, £ amounts): Tesco, 6.71 GBP, 1994-04-19,
  8 items, conf 0.95, no review. CORRECT (£→GBP inferred, 19/04/94 parsed).
- HK restaurant (handwritten Chinese/English stub, no line items):
  Xie Xie Nong, 454 HKD, 2021-07-01, items [], conf 0.9, no review.
  CORRECT (empty items list is right — the stub has none).
- All three replies fed through the REAL Parse code: REAL-FILE CHAIN ALL
  PASS. Raw replies in tests/_model_*.txt (repo only, not in the zip).

## 4a. Synthetic receipt (live vision model) — PASS
- Synthetic receipt `tests/fixtures/receipt_sample.png` (Jollibee-style,
  total 468.16, dated 2026-09-05) run through the EXACT workflow prompt.
- Route: an agent-CLI one-shot with the receipt attached
  (agent-CLI one-shot, image attached, prompt from
  tests/fixtures/vision_prompt.txt), using the same model
  family intended for the vision call; no API key embedded anywhere.
  Raw reply kept in tests/_model_reply.txt (repo only, not in zip).
- Repro: `node tests/test_vision_spark.js [reply-file]` feeds the reply
  through the REAL Parse Receipt JSON code and asserts the receipt.
- Result (two independent runs): merchant JOLLIBEE, 468.16, PHP,
  2026-09-05, Food, 3 items, confidence 0.99, needs_review=false —
  VISION CHAIN: ALL PASS (5/5). Run 2 also proved noise tolerance: the runner
  prepends a `session_id:` line and the model omitted `notes`; the parser's
  brace-extraction + defaults handled both.
- Note: live testing goes through the agent-CLI route above. A TEST-ONLY
  workflow variant for alternate model routes exists in the repo folder
  and is EXCLUDED from the submission zip.

## 5. Not covered (needs live credentials — reviewer smoke test)
- Real Gmail/Drive/Sheets/Telegram/Gemini round-trips (docs/SETUP.md section
  7 is the 5-minute checklist). Mitigation: every external parameter was
  verified against installed node sources; all response handling is
  defensive (continueOnFail + Errors tab + upsert keys).

## Known limits (honest)
- W1 poll processes up to 50 mails/run (Config maxResults); more than that
  drains over consecutive polls — intentional API courtesy.
- A Drive file re-uploaded after a mid-run crash can leave a duplicate byte
  copy; Sheet rows stay exact via upsert keys, and the mail is retried
  unlabeled until fully handled.
- Telegram `file_size` is absent on some photo sizes; oversize then enforces
  after download rather than before (still enforced).


## In-engine verification (n8n 2.37.10, live run 2026-09-07)

Beyond the offline harness above, the vision chain was executed INSIDE a real n8n
instance (Docker, n8n 2.37.10) to prove the production node chain works in-engine:

- Both portfolio workflows import cleanly into n8n 2.37.10 (0 defects, 0 warnings).
- A demo harness workflow (`demo/demo_receipt_vision_chain.json`) mirrors W2's
  hot path with a Webhook trigger instead of Telegram: Download photo ->
  **Photo to Base64 (verbatim W2 code)** -> vision HTTP call -> **Parse Receipt
  JSON (same validation as W2, reading an OpenAI-compatible reply shape with a
  Gemini `candidates[]` fallback)**.
- Live run: webhook POST with a real receipt photo -> vision model (glm-5.3-flash
  via an OpenAI-compatible endpoint) -> validated record. Result in 11.2s:
  merchant JOLLIBEE - ALABANG TOWN CENTER, amount 468.16 PHP, date 2026-09-07,
  category Food, 3 line items, confidence 0.95, needs_review=false.
- Evidence: `docs/images/demo_run.mp4` (screen recording of the live run) and
  `docs/images/demo_*.png` (green-node canvas, node detail views, executions tab).
- The demo webhook supplies the vision API key per request; it is built into the
  Authorization header at runtime and never persisted in workflow JSON, item
  data, or this repository.
