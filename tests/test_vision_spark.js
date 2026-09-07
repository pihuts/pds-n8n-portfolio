// Vision-chain test, step 2 of 2 (no key needed).
// Step 1: with any vision model available to you, attach
//   tests/fixtures/receipt_sample.png and send the prompt in
//   tests/fixtures/vision_prompt.txt; save the raw reply to a text file.
// Step 2: node tests/test_vision_spark.js [reply-file]
// Feeds the model reply through the REAL Parse Receipt JSON code from
// workflows/workflow2_telegram_receipt_gemini.json and asserts the receipt.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const replyFile = process.argv[2] || path.join(__dirname, '_model_reply.txt');
const text = fs.readFileSync(replyFile, 'utf8').trim();
console.log('--- model raw output ---');
console.log(text.slice(0, 800));

const wf = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'workflows', 'workflow2_telegram_receipt_gemini.json'), 'utf8'));
const js = wf.nodes.find(n => n.name === 'Parse Receipt JSON').parameters.jsCode;
const items = [{ json: { candidates: [{ content: { parts: [{ text }] } }] } }];
const reg = {
  'Extract Telegram Meta': [{ json: { submission_date: '2026-09-06', submission_iso: '2026-09-06T00:00:00.000Z', telegram_user: 'Vision Model Test', telegram_message_id: 2, file_unique_id: 'vision-test-1' } }],
  'Drive Upload Photo': [{ json: { id: 'drv_test1', webViewLink: 'https://drive.google.com/file/d/drv_spark1/view', name: '2026-09-06_2.png' } }],
  'Config': [{ json: { currencyDefault: 'PHP', minConfidence: 0.6 } }],
};
const $ = (n) => ({ first: () => ({ json: (reg[n][0] || {}).json || {} }), all: () => reg[n] || [], item: { json: (reg[n][0] || {}).json || {} } });
const sb = { $input: { first: () => items[0], all: () => items, item: items[0] }, $, $env: {}, $node: { name: 'Parse' }, $now: { toISO: () => new Date().toISOString() }, Buffer, console };
vm.createContext(sb);
vm.runInContext('(async()=>{' + js + '})', sb).call({ helpers: {} }).then(r => {
  const p = (Array.isArray(r) ? r[0] : r).json;
  console.log('--- parsed receipt record ---');
  console.log(JSON.stringify(p, null, 1));
  const checks = [
    ['merchant contains JOLLIBEE', /jollibee/i.test(p.merchant)],
    ['amount == 468.16', p.amount === 468.16],
    ['currency == PHP', p.currency === 'PHP'],
    ['receipt_date == 2026-09-05', p.receipt_date === '2026-09-05'],
    ['needs_review == false', p.needs_review === false],
  ];
  let fail = 0;
  for (const [m, ok] of checks) { console.log((ok ? '  PASS ' : '  FAIL ') + m); if (!ok) fail++; }
  console.log(fail === 0 ? 'VISION CHAIN: ALL PASS' : 'VISION CHAIN: ' + fail + ' FAILED');
  process.exit(fail === 0 ? 0 : 1);
}).catch(e => { console.error('PARSE FAILED', e); process.exit(1); });
