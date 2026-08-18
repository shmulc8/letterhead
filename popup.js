const RESOURCE_TYPES = [
  'main_frame', 'sub_frame', 'stylesheet', 'script', 'image', 'font',
  'object', 'xmlhttprequest', 'ping', 'csp_report', 'media', 'websocket', 'other'
];

const $ = sel => document.querySelector(sel);
const origin = domain => `*://${domain}/*`;

const msg = (text, kind = 'error') => {
  const el = $('#msg');
  el.textContent = text;
  el.className = kind === 'ok' ? 'ok' : '';
};

const state = { rules: [], enabled: true };

// Host access is requested the moment a rule goes live, never at install.
async function ensureAccess(rule) {
  const perm = { origins: [origin(rule.domain)] };
  return await chrome.permissions.contains(perm) || chrome.permissions.request(perm);
}

function toDnr(rule, id) {
  const header = { header: rule.name, operation: rule.op };
  if (rule.op !== 'remove') header.value = rule.value;

  const action = { type: 'modifyHeaders' };
  action[rule.target === 'response' ? 'responseHeaders' : 'requestHeaders'] = [header];

  return {
    id,
    priority: 1,
    action,
    condition: { requestDomains: [rule.domain], resourceTypes: RESOURCE_TYPES }
  };
}

// Dynamic rules persist across restarts, so the whole extension is just this popup.
async function apply() {
  const live = state.enabled ? state.rules.filter(r => r.on) : [];
  const current = await chrome.declarativeNetRequest.getDynamicRules();
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: current.map(r => r.id),
    addRules: live.map((r, i) => toDnr(r, i + 1))
  });
}

async function save() {
  await chrome.storage.local.set({ rules: state.rules, enabled: state.enabled });
  // Chrome rejects the whole batch on an illegal rule (e.g. append on a
  // request header outside its allowlist), so surface that instead of failing mute.
  try {
    await apply();
  } catch (err) {
    msg(`Chrome rejected a rule: ${err.message}`);
  }
  render();
}

function describe(rule) {
  return rule.op === 'remove'
    ? `${rule.op} ${rule.name}`
    : `${rule.op} ${rule.name}: ${rule.value}`;
}

function toggle(checked, onchange) {
  const label = document.createElement('label');
  label.className = 'switch';

  const box = document.createElement('input');
  box.type = 'checkbox';
  box.checked = checked;
  box.onchange = () => onchange(box);

  const track = document.createElement('span');
  track.className = 'track';

  label.append(box, track);
  return label;
}

function row(rule, index) {
  const li = document.createElement('li');

  const sw = toggle(rule.on, async box => {
    if (box.checked && !await ensureAccess(rule)) {
      box.checked = false;
      msg('Host access denied — rule stays off.');
      return;
    }
    rule.on = box.checked;
    msg('');
    await save();
  });

  const tag = document.createElement('span');
  tag.className = `tag ${rule.target}`;
  tag.textContent = rule.target === 'response' ? 'res' : 'req';

  const detail = document.createElement('div');
  detail.className = 'detail';
  const code = document.createElement('code');
  code.textContent = describe(rule);
  const host = document.createElement('small');
  host.textContent = rule.domain;
  detail.append(code, host);

  const del = document.createElement('button');
  del.className = 'del';
  del.textContent = '×';
  del.title = 'Delete rule and revoke its host access';
  del.onclick = async () => {
    const [gone] = state.rules.splice(index, 1);
    if (!state.rules.some(r => r.domain === gone.domain)) {
      await chrome.permissions.remove({ origins: [origin(gone.domain)] });
    }
    await save();
  };

  li.append(sw, tag, detail, del);
  return li;
}

function render() {
  $('#enabled').checked = state.enabled;

  const list = $('#list');
  list.textContent = '';

  if (!state.rules.length) {
    const empty = document.createElement('li');
    empty.className = 'empty';
    empty.textContent = 'No rules yet';
    list.append(empty);
    return;
  }

  state.rules.forEach((rule, i) => list.append(row(rule, i)));
}

$('#op').onchange = () => { $('#value').disabled = $('#op').value === 'remove'; };

$('#enabled').onchange = async () => {
  state.enabled = $('#enabled').checked;
  await save();
};

$('#add').onclick = async () => {
  const domain = $('#domain').value.trim()
    .replace(/^\w+:\/\//, '')   // strip scheme
    .replace(/[:/].*$/, '');    // strip port and path
  const rule = {
    domain,
    name: $('#name').value.trim(),
    value: $('#value').value,
    target: $('#target').value,
    op: $('#op').value,
    on: true
  };
  msg('');

  if (!rule.domain || !rule.name) {
    msg('Domain and header name are required.');
    return;
  }
  if (!await ensureAccess(rule)) {
    msg('Host access denied — rule not added.');
    return;
  }

  state.rules.push(rule);
  await save();
  $('#domain').value = $('#name').value = $('#value').value = '';
};

$('#export').onclick = () => {
  const blob = new Blob([JSON.stringify(state.rules, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'letterhead-rules.json';
  a.click();
  URL.revokeObjectURL(a.href);
};

// Imported rules arrive disabled: enabling one is what triggers its host prompt.
$('#import').onchange = async event => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const incoming = JSON.parse(await file.text());
    if (!Array.isArray(incoming)) throw new Error('expected a JSON array');

    const valid = incoming.filter(r => r && r.domain && r.name).map(r => ({
      domain: r.domain,
      name: r.name,
      value: r.value || '',
      target: r.target === 'response' ? 'response' : 'request',
      op: ['set', 'append', 'remove'].includes(r.op) ? r.op : 'set',
      on: false
    }));

    state.rules.push(...valid);
    await save();
    msg(`Imported ${valid.length} rule(s), disabled. Toggle each on to grant its domain.`, 'ok');
  } catch (err) {
    msg(`Import failed: ${err.message}`);
  } finally {
    event.target.value = '';
  }
};

chrome.storage.local.get({ rules: [], enabled: true }).then(stored => {
  state.rules = stored.rules;
  state.enabled = stored.enabled;
  render();
});
