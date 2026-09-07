// Structural validator for the PDS n8n portfolio.
// Checks: valid JSON, known node types + typeVersions (n8n 2.x),
// every connection target exists, no orphan non-trigger nodes, credentials are
// placeholders (no secrets), Code nodes declare a supported mode.
const fs = require('fs');
const path = require('path');

const WF_DIR = path.join(__dirname, '..', 'workflows');

// type -> max typeVersion known to the installed n8n (spot-checked from dist)
const KNOWN = {
  'n8n-nodes-base.scheduleTrigger': [1, 1.1, 1.2, 1.3, 1.4],
  'n8n-nodes-base.gmail': [2, 2.1, 2.2],
  'n8n-nodes-base.googleSheets': [4.5],
  'n8n-nodes-base.googleDrive': [3],
  'n8n-nodes-base.telegramTrigger': [1.2],
  'n8n-nodes-base.telegram': [1.2],
  'n8n-nodes-base.httpRequest': [4.2],
  'n8n-nodes-base.code': [2],
  'n8n-nodes-base.set': [3.4],
  'n8n-nodes-base.if': [2.2],
  'n8n-nodes-base.splitInBatches': [3],
  'n8n-nodes-base.merge': [3],
  'n8n-nodes-base.stickyNote': [1],
};
const OUTPUT_COUNTS = {
  'n8n-nodes-base.if': 2,
  'n8n-nodes-base.splitInBatches': 2,
};

let failures = 0;
function check(cond, msg) {
  console.log((cond ? '  PASS ' : '  FAIL ') + msg);
  if (!cond) failures++;
}

for (const file of fs.readdirSync(WF_DIR).filter(f => f.endsWith('.json'))) {
  console.log('\n== ' + file + ' ==');
  const wf = JSON.parse(fs.readFileSync(path.join(WF_DIR, file), 'utf8'));
  const names = new Set(wf.nodes.map(n => n.name));
  check(wf.nodes.length > 5, `node count = ${wf.nodes.length}`);
  check(wf.settings && wf.settings.timezone === 'Asia/Manila', 'timezone = Asia/Manila');
  check(wf.active === false, 'ships inactive (safe import)');

  // no secrets anywhere in the file
  const blob = JSON.stringify(wf);
  check(!/sk-[A-Za-z0-9]{8,}/.test(blob), 'no API keys embedded');
  check(!/AIza[A-Za-z0-9_-]{10,}/.test(blob), 'no Google API key embedded');
  check(!/\d{6,}:[A-Za-z0-9_-]{20,}/.test(blob), 'no Telegram bot token embedded');
  check(blob.includes('$env.GEMINI_API_KEY') === false, 'no $env key reads (W2 Gemini uses Header-Auth credential instead)');
  check(!blob.includes('N8N_BLOCK_ENV_ACCESS_IN_NODE'), 'no env-access workaround needed in workflow JSON');

  for (const n of wf.nodes) {
    if (!KNOWN[n.type]) { check(false, `unknown node type ${n.type} (${n.name})`); continue; }
    const okV = KNOWN[n.type].some(v => String(v) === String(n.typeVersion));
    check(okV, `${n.name}: ${n.type}@${n.typeVersion} known`);
    if (n.type === 'n8n-nodes-base.code') {
      check(['runOnceForAllItems', 'runOnceForEachItem'].includes(n.parameters.mode),
        `${n.name}: code mode ${n.parameters.mode}`);
      check(typeof n.parameters.jsCode === 'string' && n.parameters.jsCode.length > 20,
        `${n.name}: jsCode present (${(n.parameters.jsCode || '').length} chars)`);
    }
    if (n.credentials) {
      for (const [k, v] of Object.entries(n.credentials)) {
        check(v.id === '', `${n.name}: credential '${k}' is placeholder (empty id)`);
      }
    }
  }

  // connections resolve; output indexes valid
  const conns = wf.connections || {};
  for (const [from, groups] of Object.entries(conns)) {
    check(names.has(from), `connection source '${from}' exists`);
    const fromNode = wf.nodes.find(n => n.name === from);
    const maxOut = (OUTPUT_COUNTS[fromNode.type] || 1);
    groups.main.forEach((outArr, idx) => {
      check(idx < maxOut, `'${from}' output index ${idx} < ${maxOut}`);
      for (const t of (outArr || [])) {
        check(names.has(t.node), `'${from}' -> '${t.node}' resolves`);
      }
    });
  }
  // every non-trigger node reachable (has inbound or is a trigger/start)
  const inbound = new Set();
  for (const groups of Object.values(conns)) {
    for (const arr of (groups.main || [])) for (const t of (arr || [])) inbound.add(t.node);
  }
  for (const n of wf.nodes) {
    const isTrigger = /trigger/i.test(n.type) || n.name === 'Config';
    if (!isTrigger && !inbound.has(n.name) && n.type !== 'n8n-nodes-base.stickyNote') {
      check(false, `orphan node (no inbound): ${n.name}`);
    }
  }
  check(true, `reachability sweep done (${inbound.size} wired nodes)`);
}

console.log(failures === 0 ? '\nALL STRUCTURAL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
