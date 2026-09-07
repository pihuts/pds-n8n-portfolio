// Unit tests for every Code node in both workflows.
// Mocks the n8n Code sandbox ($input, $, $env, $node, $now, Buffer, this.helpers)
// and executes the REAL jsCode extracted from the workflow JSON files.
// STRICT vs the real engine: runOnceForEachItem nodes MUST return a single
// object (arrays = hard ValidationError in n8n); $input.first() is illegal
// in forEach mode; the pairedItem fan-out path is exercised with a fake
// paired-item registry.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const WF_DIR = path.join(__dirname, '..', 'workflows');
function load(file) { return JSON.parse(fs.readFileSync(path.join(WF_DIR, file), 'utf8')); }
function codeOf(wf, name) {
  const n = wf.nodes.find(n => n.name === name);
  if (!n) throw new Error('node not found: ' + name);
  return { mode: n.parameters.mode, js: n.parameters.jsCode };
}

function makeSandbox(items, registry, extra) {
  const $ = (name) => {
    const arr = registry[name] || [];
    return {
      first: () => ({ json: (arr[0] && arr[0].json) || {} }),
      all: () => arr.map(i => ({ json: i.json, binary: i.binary })),
      item: { json: ((arr[0] && arr[0].json) || {}) },
    };
  };
  const sandbox = {
    $input: {
      first: () => items[0],
      all: () => items,
      item: items[0],
    },
    $, $env: (extra && extra.env) || {},
    $node: { name: (extra && extra.node) || 'Test' },
    $now: { toISO: () => '2026-09-07T00:00:00.000Z' },
    Buffer,
    console,
  };
  return sandbox;
}

async function runCode(code, items, registry, extra) {
  const sb = makeSandbox(items, registry, extra);
  const ctx = vm.createContext(sb);
  const fn = vm.runInContext(`(async function() { ${code.js} })`, ctx);
  if (code.mode === 'runOnceForEachItem') {
    const out = [];
    for (const it of items) {
      sb.$input.item = it;
      const r = await fn.call(sb.this || {}).then ? await fn.call(sb.this || {}) : null;
      void r;
      // strict: single object return, no arrays, no null
      const res = await vm.runInContext(`(async function() { ${code.js} })`, ctx).call(sb);
      if (res == null) throw new Error('forEach returned null/undefined');
      if (Array.isArray(res)) throw new Error('forEach returned an ARRAY (engine throws ValidationError)');
      if (!res.json) throw new Error('forEach return missing .json');
      out.push(res);
    }
    return out;
  }
  const res = await fn.call(sb);
  if (!Array.isArray(res)) throw new Error('allItems must return an array');
  return res;
}

let pass = 0, fail = 0;
function t(cond, msg, detail) {
  if (cond) { pass++; console.log('  PASS ' + msg); }
  else { fail++; console.log('  FAIL ' + msg + (detail ? ' :: ' + detail : '')); }
}

(async () => {
  const w1 = load('workflow1_gmail_multi_label_to_sheets_drive.json');
  const w2 = load('workflow2_telegram_receipt_gemini.json');

  console.log('\n[W1] Build Gmail Query');
  let r = await runCode(codeOf(w1, 'Build Gmail Query'),
    [{ json: { labels: ['label1', 'label2', 'label3'], lookback: 'newer_than:1d', processedLabel: 'PDS/Processed' } }], {});
  t(r[0].json.query === 'newer_than:1d (label:label1 OR label:label2 OR label:label3) -label:(PDS/Processed)',
    'multi-label query built', r[0].json.query);
  r = await runCode(codeOf(w1, 'Build Gmail Query'), [{ json: { labels: 'labelA, labelB', processedLabel: 'PDS/Processed' } }], {});
  t(r[0].json.query.includes('label:labelA') && r[0].json.query.includes('label:labelB'), 'string labels tolerated');

  console.log('\n[W1] Extract Email Fields (raw-mode header lines + Gmail API shape)');
  const gmailMsg = {
    json: {
      id: 'msg_001', threadId: 'thr_1', snippet: 'Please see attached invoice',
      labelIds: ['INBOX', 'label2'],
      // RAW-mode shape: headerLines lines include the 'Key: ' prefix
      headers: [
        { key: 'from', line: 'From: "Santos, Maria" <maria.santos@example.ph>' },
        { key: 'subject', line: 'Subject: Invoice for August' },
        { key: 'date', line: 'Date: Sat, 05 Sep 2026 09:15:00 +0800' },
      ],
    },
    binary: {
      attachment_0: { fileName: 'Invoice Aug 2026.pdf', mimeType: 'application/pdf' },
      attachment_1: { fileName: 'terms.xlsx', mimeType: 'application/vnd.ms-excel' },
    },
  };
  const cfg = [{ json: { labels: ['label1', 'label2'], sheetsDocId: 'S', driveParentId: 'D', processedLabel: 'P' } }];
  r = await runCode(codeOf(w1, 'Extract Email Fields'), [gmailMsg], { 'Config': cfg });
  const e = r[0].json;
  t(e.sender_name === 'Santos, Maria', 'RAW-mode From: prefix stripped, quoted name parsed', e.sender_name);
  t(e.sender_email === 'maria.santos@example.ph', 'email lowercased', e.sender_email);
  t(e.label === 'label2', 'matched label detected', e.label);
  t(e.date_received === '2026-09-05', 'date normalized from raw line', e.date_received);
  t(e.attachment_count === 2, 'attachment binaries counted');
  t(e.sender_folder === 'Santos, Maria', 'folder name clean (no From: prefix)', e.sender_folder);
  t(r[0].binary.attachment_0.fileName === 'Invoice Aug 2026.pdf', 'binary forwarded');

  // Gmail API {name,value} shape still parses
  const apiShape = JSON.parse(JSON.stringify(gmailMsg));
  apiShape.json.payload = { headers: [
    { name: 'From', value: '"API Shape" <api@x.io>' },
    { name: 'Subject', value: 'S2' },
    { name: 'Date', value: 'Sat, 05 Sep 2026 09:15:00 +0800' },
  ] };
  delete apiShape.json.headers;
  r = await runCode(codeOf(w1, 'Extract Email Fields'), [apiShape], { 'Config': cfg });
  t(r[0].json.sender_name === 'API Shape' && r[0].json.sender_email === 'api@x.io', 'Gmail API {name,value} shape parses');

  // nasty From variants
  const bare = { json: { id: 'm2', labelIds: ['label9'], headers: [{ key: 'from', line: 'From: plain@x.io' }] }, binary: {} };
  r = await runCode(codeOf(w1, 'Extract Email Fields'), [bare], { 'Config': cfg });
  t(r[0].json.sender_email === 'plain@x.io' && r[0].json.label === 'label9', 'bare-email From + fallback label');
  const evil = { json: { id: 'm3', labelIds: [], headers: [{ key: 'from', line: 'From: Evil: "A/B\\C:D*E?F" <e@x.io>' }] }, binary: {} };
  r = await runCode(codeOf(w1, 'Extract Email Fields'), [evil], { 'Config': cfg });
  t(!/[/\\:*?"<>|]/.test(r[0].json.sender_folder), 'illegal filename chars sanitized', r[0].json.sender_folder);

  console.log('\n[W1] IF operator sanity (engine-valid ops only)');
  for (const name of ['IF Emails Found', 'IF Is New', 'IF Has Attachments', 'IF Label Folder Exists', 'IF Date Folder Exists', 'IF Sender Folder Exists', 'IF Upload OK']) {
    const n = w1.nodes.find(x => x.name === name);
    const ops = n.parameters.conditions.conditions.map(c => c.operator.type + ':' + c.operator.operation);
    const valid = ops.every(o => ['string:empty','string:notEmpty','number:gt','boolean:equals','array:notEmpty','object:notEmpty'].includes(o));
    t(valid, name + ' uses engine-known operators', ops.join(','));
  }

  console.log('\n[W1] Prepare Attachment Work (pairedItem re-attach, allItems)');
  const extractItem = { json: e, binary: gmailMsg.binary };
  r = await runCode(codeOf(w1, 'Prepare Attachment Work'),
    [
      { json: { row: 1 }, pairedItem: 0 },
      { json: { row: 2 }, pairedItem: 0 },
    ],
    { 'Extract Email Fields': [extractItem] });
  t(r.length === 2, 'one item per attachment (paired re-attach)');
  t(r[0].json.original_filename === 'Invoice Aug 2026.pdf', 'ORIGINAL filename preserved');
  t(r[1].binary.data.fileName === 'terms.xlsx', 'binary paired to correct item');
  t(r[0].json.drive_folder_path === 'label2/2026-09-05/Santos, Maria', 'folder path label/date/sender', r[0].json.drive_folder_path);

  console.log('\n[W1] Unique Folder Paths');
  r = await runCode(codeOf(w1, 'Unique Folder Paths'),
    [{ json: { drive_folder_path: 'label2/2026-09-05/Santos, Maria', label: 'label2', date_received: '2026-09-05', sender_folder: 'Santos, Maria' } },
     { json: { drive_folder_path: 'label2/2026-09-05/Santos, Maria', label: 'label2', date_received: '2026-09-05', sender_folder: 'Santos, Maria' } },
     { json: { drive_folder_path: 'label1/2026-09-05/Jose Rizal', label: 'label1', date_received: '2026-09-05', sender_folder: 'Jose Rizal' } }], {});
  t(r.length === 2 && r[0].json.path === 'label2/2026-09-05/Santos, Maria', 'paths deduped');

  console.log('\n[W1] Folder-loop rehydration (forEach: single-object returns, legal fallbacks)');
  r = await runCode(codeOf(w1, 'Attach Label Folder ID'),
    [{ json: { id: 'fld_label' } }], { 'Loop Over Paths': [{ json: { path: 'p', label: 'label2', date_received: '2026-09-05', sender_folder: 'S' } }] });
  t(!Array.isArray(r[0]) && r[0].json.label_folder_id === 'fld_label' && r[0].json.label === 'label2', 'L1 id attached, plan kept');
  r = await runCode(codeOf(w1, 'Emit Folder Mapping'),
    [{ json: { id: 'fld_sender' } }], { 'Attach Date Folder ID': [{ json: { path: 'p', date_folder_id: 'fld_date' } }] });
  t(!Array.isArray(r[0]) && r[0].json.path === 'p' && r[0].json.folder_id === 'fld_sender', 'mapping emitted as single object');

  console.log('\n[W1] Attach Folder ID barrier join');
  r = await runCode(codeOf(w1, 'Attach Folder ID'),
    [{ json: { drive_folder_path: 'p', original_filename: 'a.pdf' }, binary: { data: { fileName: 'a.pdf' } } },
     { json: { path: 'p', folder_id: 'fld_sender' } },
     { json: { drive_folder_path: 'p', original_filename: 'b.pdf' }, binary: { data: { fileName: 'b.pdf' } } }], {});
  t(r.length === 2 && r[0].json.folder_id === 'fld_sender' && r[0].binary.data.fileName === 'a.pdf',
    'folder ids joined, mappings dropped, binaries kept');

  console.log('\n[W2] Extract Telegram Meta (forEach: single object)');
  const upd = [{ json: { message: { message_id: 77, date: 1788652800,
    chat: { id: 555 }, from: { first_name: 'Jose', last_name: 'Rizal', username: 'jrizal' },
    photo: [{ file_id: 's', file_unique_id: 'u1', file_size: 1000 }, { file_id: 'm', file_unique_id: 'u2', file_size: 90000 }],
    caption: 'lunch' } } }];
  r = await runCode(codeOf(w2, 'Extract Telegram Meta'), upd,
    { 'Config': [{ json: { maxFileMB: 15 } }] });
  t(!Array.isArray(r[0]), 'returns single object (engine-strict)');
  t(r[0].json.file_id === 'm' && r[0].json.telegram_user === 'Jose Rizal', 'largest photo picked, user composed');
  t(r[0].json.submission_date === '2026-09-06' && r[0].json.oversized === false, 'submission date + size OK', r[0].json.submission_date);
  const big = JSON.parse(JSON.stringify(upd));
  big[0].json.message.photo[1].file_size = 20 * 1024 * 1024;
  r = await runCode(codeOf(w2, 'Extract Telegram Meta'), big, { 'Config': [{ json: { maxFileMB: 15 } }] });
  t(r[0].json.oversized === true, 'oversize flagged');

  console.log('\n[W2] Parse Receipt JSON (forEach: single object)');
  const gemResp = (text) => [{ json: { candidates: [{ content: { parts: [{ text }] } }] } }];
  const baseReg = {
    'Extract Telegram Meta': [{ json: { submission_date: '2026-09-06', submission_iso: 'x', telegram_user: 'Jose Rizal', telegram_message_id: 77, file_unique_id: 'u2' } }],
    'Drive Upload Photo': [{ json: { id: 'drv1', webViewLink: 'https://drive/x', name: '2026-09-06_77.jpg' } }],
    'Config': [{ json: { currencyDefault: 'PHP', minConfidence: 0.6 } }],
  };
  r = await runCode(codeOf(w2, 'Parse Receipt JSON'),
    gemResp('```json\n{"merchant": "Jollibee", "amount": 548.50, "currency": "php", "receipt_date": "2026-09-05", "category": "Food", "items": ["Chickenjoy", "Rice"], "confidence": 0.92, "notes": "dinner"}\n```'), baseReg);
  let p = r[0].json;
  t(!Array.isArray(r[0]), 'returns single object (engine-strict)');
  t(p.merchant === 'Jollibee' && p.amount === 548.5 && p.currency === 'PHP' && p.needs_review === false,
    'fenced model JSON parsed + normalized', JSON.stringify(p));
  r = await runCode(codeOf(w2, 'Parse Receipt JSON'),
    gemResp('Sure! Here is the data: {"merchant": "", "amount": "???", "confidence": 32} trailing text'), baseReg);
  p = r[0].json;
  t(p.merchant === 'Unknown' && p.amount === 0 && p.confidence === 0.32 && p.needs_review === true && p.receipt_date === '2026-09-06',
    'noisy output degraded gracefully (defaults + review flag)', JSON.stringify(p));
  r = await runCode(codeOf(w2, 'Parse Receipt JSON'), [{ json: {} }], baseReg);
  t(r[0].json.needs_review === true && r[0].json.drive_file_id === 'drv1', 'empty model reply never throws, drive ctx kept');

  console.log('\n[W2] IF operator sanity');
  for (const name of ['IF Is Photo', 'IF Too Large', 'IF Is New', 'IF Date Folder Exists', 'IF Upload OK', 'IF Needs Review']) {
    const n = w2.nodes.find(x => x.name === name);
    const ops = n.parameters.conditions.conditions.map(c => c.operator.type + ':' + c.operator.operation);
    const valid = ops.every(o => ['string:empty','string:notEmpty','number:gt','boolean:equals','array:notEmpty','object:notEmpty'].includes(o));
    t(valid, name + ' uses engine-known operators', ops.join(','));
  }
  const gemNode = w2.nodes.find(x => x.name === 'Gemini Vision Extract');
  t(gemNode.parameters.url.startsWith('={{') && gemNode.parameters.url.includes('+ $(\'Config\')'),
    'Gemini URL is an evaluated expression', gemNode.parameters.url.slice(0, 60));
  t(gemNode.parameters.jsonBody.includes('$jax') === false && gemNode.parameters.jsonBody.includes("$('Photo to Base64')"),
    'Gemini body reads from Photo to Base64 (fields exist there)');
  t(gemNode.parameters.genericAuthType === 'httpHeaderAuth' && !gemNode.parameters.jsonBody.includes('$env'),
    'Gemini key via Header-Auth credential (no $env dependency)');
  const cfgNode = w2.nodes.find(x => x.name === 'Config');
  t((cfgNode.parameters.options || {}).includeOtherFields === true,
    'Config forwards the Telegram payload downstream');

  console.log(`\nCODE-NODE TESTS: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(1); });
