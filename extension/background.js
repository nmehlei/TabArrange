let port, connecting = false, snapshotTimer, commandQueue = Promise.resolve(), identityPromise, sessionPromise;
function identity() {
  return identityPromise ||= (async () => {
    let { profile } = await chrome.storage.local.get('profile');
    if (!profile) { profile = { id: crypto.randomUUID(), name: 'Chrome profile' }; await chrome.storage.local.set({ profile }); }
    return profile;
  })();
}
function sessionIdentity() {
  return sessionPromise ||= (async () => {
    let { sessionId } = await chrome.storage.session.get('sessionId');
    if (!sessionId) { sessionId = crypto.randomUUID(); await chrome.storage.session.set({ sessionId }); }
    return sessionId;
  })();
}
async function sendSnapshot() {
  const connection = port; if (!connection) return;
  const [profile, sessionId, tabs, windows, groups] = await Promise.all([identity(), sessionIdentity(), chrome.tabs.query({}), chrome.windows.getAll({ windowTypes: ['normal'] }), chrome.tabGroups.query({})]);
  const windowIds = new Set(windows.filter(w => !w.incognito).map(w => w.id));
  if (port !== connection) return;
  connection.postMessage({ type: 'snapshot', profile, sessionId, capabilities: ['window-actions'],
    windows: windows.filter(w => windowIds.has(w.id)).map(w => ({ id: w.id })), groups: groups.filter(g => windowIds.has(g.windowId)),
    tabs: tabs.filter(t => windowIds.has(t.windowId) && !t.incognito).map(t => ({ id: t.id, windowId: t.windowId, groupId: t.groupId, index: t.index, title: t.title || '', url: t.url || '', pendingUrl: t.pendingUrl, active: t.active, pinned: t.pinned, audible: t.audible, status: t.status, lastAccessed: t.lastAccessed, discarded: t.discarded, favIconUrl: t.favIconUrl || '' }))
  });
}
function scheduleSnapshot() { clearTimeout(snapshotTimer); snapshotTimer = setTimeout(() => sendSnapshot().catch(() => {}), 150); }
async function connectionStatus(connected, error = '') {
  await chrome.storage.session.set({ connection: { connected, error, time: Date.now() } });
  await chrome.action.setBadgeText({ text: connected ? '' : 'OFF' });
  await chrome.action.setTitle({ title: connected ? 'Connected to TabArrange' : error || 'Start TabArrange, then click to connect' });
}
async function connect() {
  if (port || connecting) return;
  connecting = true;
  try {
    await Promise.all([identity(), sessionIdentity()]);
    const connection = chrome.runtime.connectNative('org.chrorganizer.bridge'); port = connection;
    connection.onDisconnect.addListener(() => {
      const error = chrome.runtime.lastError?.message;
      if (port === connection) { port = undefined; connectionStatus(false, error || 'Desktop app disconnected').catch(() => {}); }
    });
    connection.onMessage.addListener(message => {
      if (message.type !== 'command') return;
      commandQueue = commandQueue.then(async () => {
        if (port !== connection) return;
        const progress = result => { if (port !== connection) throw new Error('Desktop disconnected'); connection.postMessage({ type: 'progress', id: message.id, result }); };
        const ensureConnected = () => { if (port !== connection) throw new Error('Desktop disconnected'); };
        try {
          const result = await execute(message.action, progress, ensureConnected);
          if (message.action.type !== 'favicons') await sendSnapshot();
          if (port === connection) connection.postMessage({ type: 'result', id: message.id, result });
        } catch (error) {
          if (port === connection) { await sendSnapshot().catch(() => {}); connection.postMessage({ type: 'result', id: message.id, error: error.message }); }
        }
      }).catch(() => {});
    });
    await sendSnapshot();
    if (port === connection) await connectionStatus(true);
  } catch (error) { await connectionStatus(false, error.message); }
  finally { connecting = false; }
}
function protectedReason(tab, settings = {}, automatic = false) {
  if (tab.pendingUrl || tab.status === 'loading') return 'Tab is navigating';
  if (settings.protectPinned !== false && tab.pinned) return 'Pinned tab';
  if (settings.protectActive !== false && tab.active) return 'Active tab';
  if (settings.protectAudible !== false && tab.audible) return 'Playing audio';
  if (automatic && tab.groupId >= 0) return 'Grouped tab';
  try {
    const host = new URL(tab.url).hostname;
    if (settings.keepDomains?.some(domain => host === domain || host.endsWith('.' + domain))) return 'Always-keep domain';
  } catch { /* Internal and missing URLs are not domains. */ }
  return '';
}
async function checkedTabs(action) {
  if (!Array.isArray(action.tabs) || !action.tabs.length || action.tabs.length > 5000 || new Set(action.tabs.map(t => t.id)).size !== action.tabs.length) throw new Error('Invalid tab selection');
  const tabs = [];
  for (const expected of action.tabs) {
    if (!Number.isInteger(expected.id) || typeof expected.url !== 'string') throw new Error('Invalid tab reference');
    const tab = await chrome.tabs.get(expected.id);
    if (tab.incognito || tab.url !== expected.url || (action.type !== 'focus' && (tab.pendingUrl || tab.status === 'loading'))) throw new Error('A selected tab changed or is loading. Refresh and try again.');
    tabs.push(tab);
  }
  return tabs;
}
async function execute(action, progress = () => {}, ensureConnected = () => {}) {
  if (!action || typeof action.type !== 'string') throw new Error('Invalid command');
  if (action.type === 'refresh') return { count: 0 };
  if (action.type === 'rename') {
    if (typeof action.name !== 'string' || !action.name.trim() || action.name.length > 80) throw new Error('Invalid profile name');
    const profile = { ...await identity(), name: action.name.trim() };
    await chrome.storage.local.set({ profile }); identityPromise = Promise.resolve(profile); return { count: 0 };
  }
  if (action.sessionId !== await sessionIdentity()) throw new Error('Chrome restarted. Refresh the tab list.');
  if (['focus-window', 'close-window'].includes(action.type)) {
    const target = await chrome.windows.get(action.windowId, { populate: true });
    if (target.incognito || target.type !== 'normal') throw new Error('Window is not available');
    ensureConnected();
    if (action.type === 'focus-window') {
      if (target.state === 'minimized') await chrome.windows.update(target.id, { state: 'normal' });
      await chrome.windows.update(target.id, { focused: true }); return { count: 1 };
    }
    const tabs = target.tabs || [];
    if (!Array.isArray(action.tabs) || action.tabs.length !== tabs.length || tabs.some(t => t.pendingUrl || !action.tabs.some(expected => expected.id === t.id && expected.url === t.url))) throw new Error('Window contents changed. Review and confirm again.');
    ensureConnected();
    await chrome.windows.remove(target.id);
    const remaining = new Set((await chrome.tabs.query({})).map(t => t.id));
    const closed = tabs.filter(t => !remaining.has(t.id)).map(({ id, url, title, windowId, index }) => ({ id, url, title, windowId, index }));
    const skipped = tabs.filter(t => remaining.has(t.id)).map(t => ({ id: t.id, reason: 'Window closure was cancelled' }));
    progress({ closed, skipped }); return { count: closed.length, closed, skipped };
  }
  if (action.type === 'favicons') {
    if (!Array.isArray(action.tabs) || action.tabs.length > 32) throw new Error('Request at most 32 visible favicons');
    const icons = [];
    // Query only Chrome's own favicon service. No remote favicon provider or site fetches.
    for (let offset = 0; offset < action.tabs.length; offset += 4) {
      icons.push(...await Promise.all(action.tabs.slice(offset, offset + 4).map(async expected => {
        try {
          const tab = await chrome.tabs.get(expected.id);
          if (tab.incognito || tab.url !== expected.url || !/^https?:\/\//.test(tab.url)) return { id: expected.id, data: null };
          const url = new URL(chrome.runtime.getURL('/_favicon/'));
          url.searchParams.set('pageUrl', tab.url); url.searchParams.set('size', '32');
          const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
          if (!response.ok) return { id: expected.id, data: null };
          const bytes = new Uint8Array(await response.arrayBuffer());
          if (bytes.length > 32768 || ![137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) return { id: expected.id, data: null };
          return { id: expected.id, data: 'data:image/png;base64,' + btoa(String.fromCharCode(...bytes)) };
        } catch { return { id: expected.id, data: null }; }
      })));
    }
    return { icons };
  }
  if (action.type === 'restore') {
    if (!Array.isArray(action.tabs) || action.tabs.length > 5000) throw new Error('Invalid recovery request');
    const restored = [], skipped = [];
    let windows = (await chrome.windows.getAll({ windowTypes: ['normal'] })).filter(w => !w.incognito);
    for (const saved of action.tabs) {
      ensureConnected();
      try {
        if (!/^(https?:\/\/|file:\/\/|chrome:\/\/|about:blank$)/.test(saved.url || '')) throw new Error('This URL type cannot be reopened');
        let target = action.originalSessionId === action.sessionId && windows.find(w => w.id === saved.windowId);
        target ||= windows[0];
        if (!target) { target = await chrome.windows.create({ focused: false }); windows.push(target); }
        const created = await chrome.tabs.create({ windowId: target.id, url: saved.url, active: false, ...(action.originalSessionId === action.sessionId && target.id === saved.windowId && Number.isInteger(saved.index) ? { index: saved.index } : {}) });
        const record = { id: saved.id, newId: created.id }; restored.push(record); progress({ restored: [record] });
      } catch (error) { const record = { id: saved.id, reason: error.message }; skipped.push(record); progress({ skipped: [record] }); }
    }
    return { count: restored.length, restored, skipped };
  }
  const tabs = await checkedTabs(action);
  ensureConnected();
  if (action.type === 'focus') { await chrome.tabs.update(tabs[0].id, { active: true }); await chrome.windows.update(tabs[0].windowId, { focused: true }); return { count: 1 }; }
  if (action.type === 'close') {
    const closed = [], skipped = [];
    const planned = new Set(tabs.map(t => t.id));
    for (const expected of tabs) {
      ensureConnected();
      let record;
      try {
        const current = await chrome.tabs.get(expected.id);
        const siblings = await chrome.tabs.query({ windowId: current.windowId });
        let reason = current.url !== expected.url ? 'URL changed' : protectedReason(current, action.protections, action.automatic === true);
        if (current.incognito) reason = 'Incognito tab';
        if (siblings.length <= 1) reason = 'Last tab in window';
        if (!reason && action.automatic) {
          const reference = action.survivors?.find(s => s.url === current.url);
          if (reference) {
            const survivor = await chrome.tabs.get(reference.id).catch(() => null);
            if (!survivor || survivor.incognito || survivor.url !== current.url || survivor.pendingUrl || planned.has(survivor.id)) reason = 'Duplicate survivor changed';
          } else if (!['chrome://newtab/', 'chrome://newtab', 'chrome://new-tab-page/', 'about:blank'].includes(current.url)) reason = 'Cleanup candidate is no longer safe';
        }
        if (reason) { record = { id: expected.id, reason }; skipped.push(record); progress({ skipped: [record] }); continue; }
        ensureConnected();
        await chrome.tabs.remove(current.id);
        record = { id: current.id, url: current.url, title: current.title, windowId: current.windowId, index: current.index };
        closed.push(record); progress({ closed: [record] });
      } catch (error) {
        if (closed.some(t => t.id === expected.id)) throw error;
        record = { id: expected.id, reason: error.message }; skipped.push(record); progress({ skipped: [record] });
      }
    }
    return { count: closed.length, closed, skipped };
  }
  if (!['group', 'move'].includes(action.type)) throw new Error('Unknown operation');
  const destination = await chrome.windows.get(action.windowId);
  if (destination.incognito || destination.type !== 'normal') throw new Error('Invalid target window');
  if (tabs.some(tab => tab.pinned)) throw new Error('Unpin selected tabs in Chrome before moving them');
  if (action.groupId !== undefined) { const group = await chrome.tabGroups.get(action.groupId); if (group.windowId !== destination.id) throw new Error('Target group moved. Refresh and try again.'); }
  // Preserve source windows, even when every tab is moved out of them.
  for (const windowId of new Set(tabs.filter(t => t.windowId !== destination.id).map(t => t.windowId))) {
    const siblings = await chrome.tabs.query({ windowId });
    if (siblings.every(t => tabs.some(selected => selected.id === t.id))) await chrome.tabs.create({ windowId, active: false });
  }
  ensureConnected();
  if (action.type === 'move') { await chrome.tabs.move(tabs.map(t => t.id), { windowId: destination.id, index: -1 }); }
  else {
    const groupId = action.groupId === undefined ? await chrome.tabs.group({ tabIds: tabs.map(t => t.id), createProperties: { windowId: destination.id } }) : await chrome.tabs.group({ tabIds: tabs.map(t => t.id), groupId: action.groupId });
    if (action.groupId === undefined) await chrome.tabGroups.update(groupId, { title: String(action.title || 'New group').slice(0, 100), color: 'blue' });
  }
  return { count: tabs.length };
}
chrome.action.onClicked.addListener(() => connect());
chrome.runtime.onStartup.addListener(() => { chrome.alarms.create('reconnect', { periodInMinutes: 0.5 }); connect(); });
chrome.runtime.onInstalled.addListener(() => { chrome.alarms.create('reconnect', { periodInMinutes: 0.5 }); connect(); });
chrome.alarms.onAlarm.addListener(() => connect());
chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes.profile) { identityPromise = undefined; scheduleSnapshot(); } });
for (const event of [chrome.tabs.onCreated, chrome.tabs.onRemoved, chrome.tabs.onUpdated, chrome.tabs.onMoved, chrome.tabs.onActivated, chrome.tabs.onAttached, chrome.tabs.onDetached, chrome.windows.onCreated, chrome.windows.onRemoved, chrome.tabGroups.onCreated, chrome.tabGroups.onUpdated, chrome.tabGroups.onRemoved, chrome.tabGroups.onMoved]) event.addListener(scheduleSnapshot);
connect();
