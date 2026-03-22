/**
 * Property Inspector — OBS Automation (com.dreadheadhippy.obswa)
 *
 * Communicates with the plugin backend via the StreamDeck WebSocket protocol.
 * All data written to the DOM uses textContent (never innerHTML) to prevent XSS.
 */

'use strict';

// ── State ─────────────────────────────────────────────────────────────────────

/** @type {WebSocket|null} */
let ws = null;
let pluginUUID = null;
let actionUUID = null;
let contextUUID = null;

let globalSettings = {};
let saveTimer = null;

// ── Workflow state ─────────────────────────────────────────────────────────────
let workflowState = { label: '', actions: [] };
let workflowSaveTimer = null;

// OBS data cache populated by the plugin on connection
let obsCache = { scenes: [], inputs: [], hotkeys: [] };

// ── StreamDeck handshake ──────────────────────────────────────────────────────

/**
 * Called by the StreamDeck application when the property inspector loads.
 * @param {number}  port
 * @param {string}  uuid          - plugin registration UUID
 * @param {string}  registerEvent - "registerPropertyInspector"
 * @param {string}  _info         - unused registration info JSON
 * @param {string}  actionInfo    - JSON with action context and settings
 */
// eslint-disable-next-line no-unused-vars
function connectElgatoStreamDeckSocket(port, uuid, registerEvent, _info, actionInfo) {
  pluginUUID  = uuid;

  const parsed = JSON.parse(actionInfo);
  actionUUID  = parsed.action;   // e.g. "com.dreadheadhippy.obswa.workflow"
  contextUUID = parsed.context;  // unique instance for this deck button

  ws = new WebSocket(`ws://127.0.0.1:${port}`);

  ws.addEventListener('open', () => {
    send({ event: registerEvent, uuid });
    send({ event: 'getGlobalSettings', context: pluginUUID });
    // getSettings also uses pluginUUID in SDK v2 property inspector context
    send({ event: 'getSettings', context: pluginUUID });
  });

  ws.addEventListener('message', (evt) => {
    let msg;
    try { msg = JSON.parse(evt.data); }
    catch { return; }
    handleMessage(msg);
  });
}

// ── Incoming message dispatch ─────────────────────────────────────────────────

function handleMessage(msg) {
  switch (msg.event) {
    case 'didReceiveGlobalSettings':
      globalSettings = msg.payload?.settings ?? {};
      populateConnectionForm(globalSettings.connection ?? {});
      break;

    case 'didReceiveSettings':
      loadWorkflowFromSettings(msg.payload?.settings ?? {});
      break;

    case 'sendToPropertyInspector':
      handlePluginMessage(msg.payload);
      break;
  }
}

// ── Connection form ───────────────────────────────────────────────────────────

function populateConnectionForm(conn) {
  const useAuth = Boolean(conn.useAuth);
  el('obs-host').value       = sanitize(conn.host ?? 'localhost');
  el('obs-port').value       = Number.isInteger(conn.port) ? conn.port : 4455;
  el('obs-use-auth').checked = useAuth;
  el('obs-password').value   = conn.password ?? '';
  setPasswordVisible(useAuth);
}

function saveConnectionSettings() {
  const host     = el('obs-host').value.trim();
  const port     = parseInt(el('obs-port').value, 10);
  const useAuth  = el('obs-use-auth').checked;
  const password = el('obs-password').value;

  // Client-side validation — mirrored in the plugin for defence-in-depth
  if (!host || !/^[a-zA-Z0-9.\-_]+$/.test(host)) {
    showStatus('error', 'Invalid host address. Enter a hostname or IP only (e.g. localhost).');
    return false;
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    showStatus('error', 'Port must be between 1 and 65535.');
    return false;
  }

  globalSettings.connection = { host, port, useAuth, password };
  send({ event: 'setGlobalSettings', context: pluginUUID, payload: globalSettings });
  return true;
}

function setPasswordVisible(visible) {
  el('password-row').style.display = visible ? '' : 'none';
}

// ── Plugin → PI message handling ──────────────────────────────────────────────

function handlePluginMessage(payload) {
  if (!payload || typeof payload !== 'object') return;

  if (payload.event === 'connectionStatus') {
    el('test-btn').disabled = false;
    showStatus(sanitize(payload.status), sanitize(payload.message));
  }
  if (payload.event === 'obsData') {
    if (payload.error) {
      el('obs-hint').style.display = '';
    } else {
      el('obs-hint').style.display = 'none';
      obsCache.scenes  = Array.isArray(payload.scenes)  ? payload.scenes  : [];
      obsCache.inputs  = Array.isArray(payload.inputs)  ? payload.inputs  : [];
      obsCache.hotkeys = Array.isArray(payload.hotkeys) ? payload.hotkeys : [];
      refreshAllSelects();
    }
  }}

// ── Status display ────────────────────────────────────────────────────────────

function showStatus(type, message) {
  const s = el('conn-status');
  s.dataset.type = type;   // 'connected' | 'error' | 'testing' | 'idle'
  s.textContent  = message; // textContent — XSS-safe
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function el(id) { return document.getElementById(id); }

function send(obj) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

/** Strip HTML special chars when writing settings values into the DOM. */
function sanitize(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/[<>"'&]/g, '');
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveConnectionSettings, 600);
}

// ─────────────────────────────────────────────────────────────────────────────
// ── Workflow builder ──────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

// ── Action type definitions ────────────────────────────────────────────────

const ACTION_LABELS = {
  switchScene: 'Switch Scene', toggleSource: 'Toggle Source',
  setSourceVisibility: 'Set Source Visibility',
  muteSource: 'Mute Source', unmuteSource: 'Unmute Source', toggleMute: 'Toggle Mute',
  startStream: 'Start Streaming', stopStream: 'Stop Streaming',
  startRecord: 'Start Recording', stopRecord: 'Stop Recording', toggleRecord: 'Toggle Recording',
  triggerHotkey: 'Trigger Hotkey', setTextContent: 'Set Text Source', wait: 'Wait',
};

/**
 * Field descriptor: { key, label, kind }
 * kind: 'scene-select' | 'input-select' | 'hotkey-select' | 'text' | 'number' | 'checkbox' | 'duration'
 */
const ACTION_FIELDS = {
  switchScene:          [{ key: 'sceneName',  label: 'Scene',   kind: 'scene-select' }],
  toggleSource:         [{ key: 'sceneName',  label: 'Scene',   kind: 'scene-select' },
                         { key: 'sourceName', label: 'Source',  kind: 'input-select' }],
  setSourceVisibility:  [{ key: 'sceneName',  label: 'Scene',   kind: 'scene-select' },
                         { key: 'sourceName', label: 'Source',  kind: 'input-select' },
                         { key: 'visible',    label: 'Visible', kind: 'checkbox'     }],
  muteSource:           [{ key: 'sourceName', label: 'Source',  kind: 'input-select' }],
  unmuteSource:         [{ key: 'sourceName', label: 'Source',  kind: 'input-select' }],
  toggleMute:           [{ key: 'sourceName', label: 'Source',  kind: 'input-select' }],
  startStream: [], stopStream: [], startRecord: [], stopRecord: [], toggleRecord: [],
  triggerHotkey:        [{ key: 'hotkeyName', label: 'Hotkey',       kind: 'hotkey-select' }],
  setTextContent:       [{ key: 'sourceName', label: 'Source',       kind: 'input-select'  },
                         { key: 'text',       label: 'Text',         kind: 'text'          }],
  wait:                 [{ key: 'durationMs', label: 'Duration (ms)', kind: 'duration'     }],
};

// ── Action state helpers ───────────────────────────────────────────────────

function makeAction(type) {
  return { id: crypto.randomUUID(), type, delayMs: 0 };
}

function loadWorkflowFromSettings(settings) {
  const wf = settings?.workflow;
  if (!wf) return;
  workflowState.label   = wf.label   ?? '';
  workflowState.actions = Array.isArray(wf.actions) ? wf.actions : [];
  el('workflow-label').value = workflowState.label;
  renderWorkflow();
}

// ── Save ──────────────────────────────────────────────────────────────────

function scheduleWorkflowSave() {
  clearTimeout(workflowSaveTimer);
  workflowSaveTimer = setTimeout(saveWorkflowSettings, 500);
}

function saveWorkflowSettings() {
  // setSettings must use the PI's own UUID (inPropertyInspectorUUID),
  // not the action context — this is how StreamDeck SDK v2 PIs save settings.
  send({
    event:   'setSettings',
    context: pluginUUID,
    payload: {
      workflow: {
        label:   workflowState.label,
        actions: workflowState.actions,
      },
    },
  });
}

// ── Render ────────────────────────────────────────────────────────────────

function renderWorkflow() {
  const list  = el('action-list');
  const empty = el('action-empty');
  list.innerHTML = '';   // safe: no user data injected

  const total = workflowState.actions.length;
  empty.style.display = total === 0 ? '' : 'none';

  workflowState.actions.forEach((action, idx) => {
    list.appendChild(buildActionCard(action, idx, total));
  });
}

function buildActionCard(action, idx, total) {
  const card = document.createElement('div');
  card.className  = 'action-card';
  card.dataset.id = action.id;
  card.setAttribute('role', 'listitem');

  // ── Header ──────────────────────────────────────────────────────────────
  const header = document.createElement('div');
  header.className = 'action-header';

  const badge = document.createElement('span');
  badge.className   = 'action-index';
  badge.textContent = String(idx + 1);

  const typeLabel = document.createElement('span');
  typeLabel.className   = 'action-type-label';
  typeLabel.textContent = ACTION_LABELS[action.type] ?? action.type;

  const ctrlGroup = document.createElement('div');
  ctrlGroup.className = 'action-ctrl-group';
  ctrlGroup.appendChild(ctrlBtn('↑', 'up',  idx === 0));
  ctrlGroup.appendChild(ctrlBtn('↓', 'down', idx === total - 1));
  ctrlGroup.appendChild(ctrlBtn('✕', 'del', false, true));

  header.appendChild(badge);
  header.appendChild(typeLabel);
  header.appendChild(ctrlGroup);

  // ── Body ────────────────────────────────────────────────────────────────
  const body = document.createElement('div');
  body.className = 'action-body';

  const fields = ACTION_FIELDS[action.type] ?? [];
  fields.forEach((fd) => {
    body.appendChild(buildField(fd, action));
  });

  // Delay field — always last, shown for non-wait action types
  if (action.type !== 'wait') {
    body.appendChild(buildDelayField(action));
  }

  card.appendChild(header);
  card.appendChild(body);
  return card;
}

function ctrlBtn(label, op, disabled, isDel = false) {
  const btn = document.createElement('button');
  btn.type      = 'button';
  btn.className = 'ctrl-btn' + (isDel ? ' del' : '');
  btn.dataset.op = op;
  btn.textContent = label;
  btn.disabled    = disabled;
  btn.title = { up: 'Move up', down: 'Move down', del: 'Remove' }[op] ?? '';
  return btn;
}

function buildField(fd, action) {
  const row = document.createElement('div');
  row.className = 'field';

  const lbl = document.createElement('label');
  lbl.textContent = fd.label;

  row.appendChild(lbl);
  row.appendChild(buildInput(fd, action));
  return row;
}

function buildInput(fd, action) {
  const { key, kind } = fd;
  const currentVal    = action[key];

  if (kind === 'scene-select' || kind === 'input-select' || kind === 'hotkey-select') {
    const sel     = document.createElement('select');
    sel.dataset.key  = key;
    sel.dataset.kind = 'select';

    const items = kind === 'scene-select'  ? obsCache.scenes
                : kind === 'hotkey-select' ? obsCache.hotkeys
                : obsCache.inputs;

    if (items.length === 0) {
      addOption(sel, '', '\u2014 connect OBS first \u2014', true);
    } else {
      addOption(sel, '', '\u2014 choose \u2014', false);
      items.forEach((name) => addOption(sel, name, name, name === currentVal));
    }
    // If saved value is not in list, still show it so it isn't lost
    if (currentVal && !items.includes(currentVal)) {
      addOption(sel, currentVal, currentVal + ' (not found)', true);
    }
    return sel;
  }

  if (kind === 'checkbox') {
    const wrap  = document.createElement('label');
    wrap.className = 'toggle';
    wrap.style.justifyContent = 'flex-start';

    const chk   = document.createElement('input');
    chk.type          = 'checkbox';
    chk.dataset.key   = key;
    chk.dataset.kind  = 'checkbox';
    chk.checked       = Boolean(currentVal);

    const track = document.createElement('span');
    track.className = 'track';
    track.appendChild(Object.assign(document.createElement('span'), { className: 'thumb' }));

    const lbl2 = document.createElement('span');
    lbl2.className   = 'toggle-label';
    lbl2.textContent = 'Show source';

    wrap.appendChild(chk);
    wrap.appendChild(track);
    wrap.appendChild(lbl2);
    return wrap;
  }

  if (kind === 'duration') {
    const inp        = document.createElement('input');
    inp.type         = 'number';
    inp.dataset.key  = key;
    inp.dataset.kind = 'number';
    inp.min          = '100';
    inp.max          = '30000';
    inp.step         = '100';
    inp.placeholder  = '1000';
    inp.value        = currentVal ?? 1000;
    return inp;
  }

  if (kind === 'text') {
    const inp        = document.createElement('input');
    inp.type         = 'text';
    inp.dataset.key  = key;
    inp.dataset.kind = 'text';
    inp.maxLength    = 500;
    inp.value        = currentVal ?? '';
    return inp;
  }

  // fallback
  return document.createElement('span');
}

function buildDelayField(action) {
  const row = document.createElement('div');
  row.className = 'field delay-row';

  const lbl = document.createElement('label');
  lbl.textContent = 'Delay (ms)';

  const inp        = document.createElement('input');
  inp.type         = 'number';
  inp.dataset.key  = 'delayMs';
  inp.dataset.kind = 'number';
  inp.min          = '0';
  inp.max          = '30000';
  inp.step         = '100';
  inp.placeholder  = '0';
  inp.value        = action.delayMs ?? 0;
  inp.title        = 'Delay before this action runs (ms)';

  row.appendChild(lbl);
  row.appendChild(inp);
  return row;
}

function addOption(sel, value, text, selected) {
  const opt      = document.createElement('option');
  opt.value      = value;
  opt.textContent = text;   // XSS-safe: textContent not innerHTML
  opt.selected   = selected;
  sel.appendChild(opt);
}

// ── Refresh dropdowns in place after OBS data arrives ───────────────────────

function refreshAllSelects() {
  const list  = el('action-list');
  if (!list) return;

  list.querySelectorAll('select[data-key]').forEach((sel) => {
    const card   = sel.closest('.action-card');
    if (!card) return;
    const id     = card.dataset.id;
    const action = workflowState.actions.find((a) => a.id === id);
    if (!action) return;

    const fields = ACTION_FIELDS[action.type] ?? [];
    const fd     = fields.find((f) => f.key === sel.dataset.key);
    if (!fd) return;

    const saved = action[fd.key] ?? '';

    // Rebuild the option list in-place so the selected value is preserved
    while (sel.firstChild) sel.removeChild(sel.firstChild);

    const items = fd.kind === 'scene-select'  ? obsCache.scenes
                : fd.kind === 'hotkey-select' ? obsCache.hotkeys
                : obsCache.inputs;

    if (items.length === 0) {
      addOption(sel, '', '\u2014 connect OBS first \u2014', true);
    } else {
      addOption(sel, '', '\u2014 choose \u2014', false);
      items.forEach((name) => addOption(sel, name, name, name === saved));
    }
    if (saved && !items.includes(saved)) {
      addOption(sel, saved, saved + ' (not found)', true);
    }
  });
}

// ── DOM wiring ────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {

  // ── Connection section ───────────────────────────────────────────────────

  // Auth toggle
  el('obs-use-auth').addEventListener('change', (e) => {
    setPasswordVisible(e.target.checked);
    scheduleSave();
  });

  // Debounced save on text/number input
  ['obs-host', 'obs-port', 'obs-password'].forEach((id) => {
    el(id).addEventListener('input', scheduleSave);
  });

  // Show / hide password
  el('toggle-pw').addEventListener('click', () => {
    const field   = el('obs-password');
    const showing = field.type === 'text';
    field.type    = showing ? 'password' : 'text';
    el('toggle-pw').setAttribute('aria-pressed', String(!showing));
    el('toggle-pw').title = showing ? 'Show password' : 'Hide password';
  });

  // Test Connection
  el('test-btn').addEventListener('click', () => {
    // Save (and validate) first — abort if validation failed
    if (saveConnectionSettings() === false) return;

    el('test-btn').disabled = true;
    showStatus('testing', 'Connecting\u2026');
    // Send the connection directly in the payload to avoid a race condition
    // where the plugin reads getGlobalSettings before setGlobalSettings persists.
    send({
      event:   'sendToPlugin',
      action:  actionUUID,
      context: contextUUID,
      payload: { event: 'testConnection', connection: globalSettings.connection },
    });
  });

  // ── Workflow section ─────────────────────────────────────────────────────

  // Button label — debounced save
  el('workflow-label').addEventListener('input', (e) => {
    workflowState.label = e.target.value;
    scheduleWorkflowSave();
  });

  // Refresh OBS data
  el('refresh-obs').addEventListener('click', () => {
    send({ event: 'sendToPlugin', action: actionUUID, context: contextUUID,
           payload: { event: 'getObsData' } });
  });

  // Add action button
  el('add-action-btn').addEventListener('click', () => {
    const picker = el('action-type-picker');
    const type   = picker.value;
    if (!type) return;

    const action = makeAction(type);
    workflowState.actions.push(action);
    picker.value = '';
    renderWorkflow();
    scheduleWorkflowSave();
  });

  // Delegated events on the action list (up / down / delete / field changes)
  el('action-list').addEventListener('click', (e) => {
    const btn = e.target.closest('.ctrl-btn');
    if (!btn) return;

    const card = btn.closest('.action-card');
    if (!card) return;
    const id  = card.dataset.id;
    const idx = workflowState.actions.findIndex((a) => a.id === id);
    if (idx === -1) return;

    const op = btn.dataset.op;
    if (op === 'del') {
      workflowState.actions.splice(idx, 1);
    } else if (op === 'up' && idx > 0) {
      [workflowState.actions[idx - 1], workflowState.actions[idx]] =
        [workflowState.actions[idx], workflowState.actions[idx - 1]];
    } else if (op === 'down' && idx < workflowState.actions.length - 1) {
      [workflowState.actions[idx], workflowState.actions[idx + 1]] =
        [workflowState.actions[idx + 1], workflowState.actions[idx]];
    }
    renderWorkflow();
    scheduleWorkflowSave();
  });

  el('action-list').addEventListener('change', (e) => {
    const card = e.target.closest('.action-card');
    if (!card) return;
    const id     = card.dataset.id;
    const action = workflowState.actions.find((a) => a.id === id);
    if (!action) return;

    const key   = e.target.dataset.key;
    const kind  = e.target.dataset.kind;
    if (!key) return;

    if (kind === 'checkbox') {
      action[key] = e.target.checked;
    } else if (kind === 'number') {
      action[key] = parseInt(e.target.value, 10) || 0;
    } else {
      action[key] = e.target.value;
    }
    scheduleWorkflowSave();
  });

  el('action-list').addEventListener('input', (e) => {
    // Only handle text inputs (select/checkbox handled by 'change')
    if (e.target.tagName !== 'INPUT' || e.target.type !== 'text') return;
    const card   = e.target.closest('.action-card');
    if (!card) return;
    const id     = card.dataset.id;
    const action = workflowState.actions.find((a) => a.id === id);
    if (!action) return;
    const key = e.target.dataset.key;
    if (key) {
      action[key] = e.target.value;
      scheduleWorkflowSave();
    }
  });

});
