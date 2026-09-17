import { key, flatten, duplicateKeys, isEmpty, filterTabs, closeReason, demoProfiles, defaultSettings, windowCounts, cleanupPlan } from './model.mjs';
const $ = selector => document.querySelector(selector), bridge = window.chromeBridge;
let live = [], demo = false, samples = [], selected = new Set(), filter = { type: 'all' }, search = '', anchor, busy = false, organizeMode = 'group', pendingClose = [], pendingOrganization, contextTab, settings = { ...defaultSettings }, demoHistory = [], proposed;
let tabsCache = [], visibleCache = [], countsCache = new Map(), rowCache = new Map(), scrollFrame;
const ROW_HEIGHT = 54;
const profiles = () => demo ? samples : live;
const allTabs = () => flatten(profiles());
// Numbers stay attached to their Chrome window for this app/browser session.
const windowLabels = new Map();
let contextWindow, pendingWindowClose;
let duplicatePositions = new Map();
function windowLabel(profileId, windowId) {
  const profile = profiles().find(p => p.id === profileId);
  const scope = `${profileId}:${profile?.sessionId || 'demo'}`;
  if (!windowLabels.has(scope)) windowLabels.set(scope, new Map());
  const labels = windowLabels.get(scope);
  if (!labels.has(windowId)) labels.set(windowId, `Window ${labels.size + 1}`);
  return labels.get(windowId);
}

const chromeGroupColors = new Set(['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange']);
const groupColor = color => chromeGroupColors.has(color) ? color : 'grey';
const faviconCache = new Map();
let faviconTimer, faviconLoading = false;
const faviconFailures = new Map();
const faviconKey = tab => `${tab.profileId}:${tab.sessionId}:${tab.url}:${tab.favIconUrl || ''}`;
function paintFavicon(icon, tab) {
  const source = tab.url.startsWith('chrome://') ? 'assets/chrome.svg' : faviconCache.get(faviconKey(tab));
  const fingerprint = source || (tab.title || '?').slice(0, 1).toUpperCase();
  if (icon.dataset.source === fingerprint) return;
  icon.dataset.source = fingerprint;
  icon.replaceChildren();
  if (source) {
    const img = node('img', 'tab-favicon'); img.src = source; img.alt = ''; img.draggable = false;
    img.onerror = () => { icon.textContent = (tab.title || '?').slice(0, 1).toUpperCase(); };
    icon.append(img);
  } else icon.textContent = fingerprint;
}
function queueFavicons(tabs) {
  if (demo || !bridge || faviconLoading) return;
  const missing = tabs.filter(t => /^https?:\/\//.test(t.url) && !faviconCache.has(faviconKey(t)) && (faviconFailures.get(t.profileId)?.retryAt || 0) <= Date.now());
  if (!missing.length) return;
  clearTimeout(faviconTimer);
  faviconTimer = setTimeout(async () => {
    if (demo || faviconLoading) return;
    faviconLoading = true;
    try {
      for (const profileId of new Set(missing.map(t => t.profileId))) {
        const batch = missing.filter(t => t.profileId === profileId).filter((tab, index, arr) => arr.findIndex(t => faviconKey(t) === faviconKey(tab)) === index).slice(0, 32);
        try {
          const result = await bridge.command(profileId, { type: 'favicons', sessionId: batch[0].sessionId, tabs: batch.map(({ id, url }) => ({ id, url })) });
          if (!Array.isArray(result.icons)) throw new Error('Favicon support unavailable');
          faviconFailures.delete(profileId);
          batch.forEach(tab => faviconCache.set(faviconKey(tab), null));
          for (const icon of result.icons) {
            const tab = batch.find(t => t.id === icon.id);
            if (tab && typeof icon.data === 'string' && icon.data.length <= 45000 && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(icon.data)) faviconCache.set(faviconKey(tab), icon.data);
          }
        } catch (error) {
          const reload = /unknown|unsupported|unavailable/i.test(error.message);
          faviconFailures.set(profileId, { retryAt: Date.now() + 30000, reload });
        }
      }
      updateFaviconNotice();
      while (faviconCache.size > 512) faviconCache.delete(faviconCache.keys().next().value);
      for (const row of rowCache.values()) paintFavicon(row.parts.icon, row.tab);
    } finally { faviconLoading = false; queueFavicons([...rowCache.values()].map(row => row.tab)); }
  }, 80);
}

function updateFaviconNotice() {
  const notice = $('#favicon-notice');
  const failures = live.filter(profile => faviconFailures.has(profile.id));
  notice.hidden = demo || !failures.length;
  notice.textContent = failures.some(profile => faviconFailures.get(profile.id).reload)
    ? 'To show website icons, open chrome://extensions and click Reload on TabArrange Bridge. Then choose Refresh tabs from the ⋯ menu.'
    : 'Website icons could not load. Choose Refresh tabs from the ⋯ menu to retry.';
}
setInterval(() => { if (!document.hidden) queueFavicons([...rowCache.values()].map(row => row.tab)); }, 30000);

// Save the divider position locally; keyboard arrows provide the same adjustment.
const divider = $('#sidebar-resizer');
function setSidebarWidth(value) {
  const max = Math.min(420, Math.max(190, innerWidth - 600));
  const width = Math.round(Math.min(max, Math.max(190, value)));
  document.documentElement.style.setProperty('--sidebar-width', `${width}px`);
  divider.setAttribute('aria-valuemax', String(max));
  divider.setAttribute('aria-valuenow', String(width));
  return width;
}
function saveSidebarWidth() { try { localStorage.setItem('sidebarWidth', divider.getAttribute('aria-valuenow')); } catch {} }
try { setSidebarWidth(Number(localStorage.getItem('sidebarWidth')) || 235); } catch { setSidebarWidth(235); }
let resizeStart;
divider.onpointerdown = event => {
  if (event.button !== 0) return;
  resizeStart = { x: event.clientX, width: Number(divider.getAttribute('aria-valuenow')) };
  divider.setPointerCapture(event.pointerId); document.body.classList.add('resizing'); event.preventDefault();
};
divider.onpointermove = event => { if (resizeStart) setSidebarWidth(resizeStart.width + event.clientX - resizeStart.x); };
divider.onpointerup = divider.onpointercancel = () => { resizeStart = undefined; document.body.classList.remove('resizing'); saveSidebarWidth(); };
divider.onlostpointercapture = () => { resizeStart = undefined; document.body.classList.remove('resizing'); };
divider.ondblclick = () => { setSidebarWidth(235); saveSidebarWidth(); };
divider.onkeydown = event => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault(); const current = Number(divider.getAttribute('aria-valuenow'));
  setSidebarWidth(event.key === 'Home' ? 190 : event.key === 'End' ? 420 : current + (event.key === 'ArrowLeft' ? -10 : 10)); saveSidebarWidth();
};
window.addEventListener('resize', () => setSidebarWidth(Number(divider.getAttribute('aria-valuenow'))));
function closeAppMenu(restoreFocus = false) {
  $('#app-menu').hidden = true; $('#app-menu-toggle').setAttribute('aria-expanded', 'false');
  if (restoreFocus) $('#app-menu-toggle').focus();
}
$('#app-menu-toggle').onclick = () => {
  const menu = $('#app-menu'); if (!menu.hidden) return closeAppMenu();
  menu.hidden = false; $('#app-menu-toggle').setAttribute('aria-expanded', 'true');
  const rect = $('#app-menu-toggle').getBoundingClientRect();
  menu.style.left = `${Math.max(8, rect.right - menu.offsetWidth)}px`; menu.style.top = `${rect.bottom + 6}px`;
  menu.querySelector('button:not(:disabled)').focus();
};
$('#app-menu').addEventListener('click', event => { if (event.target.closest('button')) closeAppMenu(); });
document.addEventListener('click', event => { if (!event.target.closest('#app-menu, #app-menu-toggle')) closeAppMenu(); });
document.addEventListener('keydown', event => {
  if ($('#app-menu').hidden) return;
  if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); closeAppMenu(true); }
  else if (!event.target.closest('select') && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
    event.preventDefault(); const buttons = [...$('#app-menu').querySelectorAll('button:not(:disabled)')], index = buttons.indexOf(document.activeElement);
    buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length].focus();
  }
});

function node(tag, className, text) { const element = document.createElement(tag); if (className) element.className = className; if (text !== undefined) element.textContent = text; return element; }
function status(message) { $('#status').textContent = message; }
function protectedReason(tab) { return closeReason(tab, tabsCache, settings, countsCache); }
function chooseFilter(next, title) { filter = next; $('#heading').textContent = title; $('#tab-list').scrollTop = 0; render(); }
function selectTab(tab, event, checked) {
  const id = key(tab);
  if (event.shiftKey && anchor && visibleCache.some(t => key(t) === anchor)) {
    const a = visibleCache.findIndex(t => key(t) === anchor), b = visibleCache.findIndex(t => key(t) === id);
    visibleCache.slice(Math.min(a, b), Math.max(a, b) + 1).forEach(t => selected.add(key(t)));
  } else {
    const add = checked ?? !selected.has(id); add ? selected.add(id) : selected.delete(id); anchor = id;
  }
  render();
}
function navButton(title, count, next, target, group = false, color = 'grey') {
  const button = node('button', 'nav-button' + (group ? ' nav-group' : '') + (JSON.stringify(next) === JSON.stringify(filter) ? ' selected' : ''));
  if (next.type === 'window') {
    const icon = node('img', 'window-icon'); icon.src = 'assets/chrome.svg'; icon.alt = ''; icon.draggable = false; button.append(icon);
  } else if (group) {
    const dot = node('span', 'group-dot'); dot.setAttribute('aria-hidden', 'true'); button.dataset.groupColor = groupColor(color); button.append(dot);
  }
  button.append(node('span', 'nav-label', title), node('span', 'nav-count', String(count)));
  button.onclick = () => chooseFilter(next, title);
  if (next.type === 'window') {
    const open = (x, y) => {
      const profile = profiles().find(p => p.id === next.profileId);
      contextWindow = { profileId: profile.id, sessionId: profile.sessionId, windowId: next.windowId };
      $('#context-menu').hidden = true; closeAppMenu();
      const menu = $('#window-menu'); menu.hidden = false;
      menu.style.left = `${Math.max(8, Math.min(x, innerWidth - 205))}px`; menu.style.top = `${Math.max(8, Math.min(y, innerHeight - 95))}px`;
      $('#window-focus').disabled = $('#window-close').disabled = busy;
      $('#window-focus').focus();
    };
    button.oncontextmenu = event => { event.preventDefault(); open(event.clientX, event.clientY); };
    button.onkeydown = event => { if ((event.key === 'F10' && event.shiftKey) || event.key === 'ContextMenu') { event.preventDefault(); const rect = button.getBoundingClientRect(); open(rect.right, rect.top); } };
  }
  if (target) {
    button.title = `Drop tabs here to ${target.groupId === undefined ? 'move to this window' : 'add to this group'}`;
    button.ondragover = event => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; button.classList.add('drop-over'); };
    button.ondragleave = () => button.classList.remove('drop-over');
    button.ondrop = event => {
      event.preventDefault(); button.classList.remove('drop-over');
      try {
        const keys = new Set(JSON.parse(event.dataTransfer.getData('application/x-chr-tabs'))), tabs = allTabs().filter(t => keys.has(key(t)));
        if (!tabs.length || busy) return;
        if (tabs.some(t => t.profileId !== target.profileId)) return status('Tabs can only move within the same Chrome profile.');
        pendingOrganization = { tabs, action: { type: target.groupId === undefined ? 'move' : 'group', ...target } };
        $('#drop-title').textContent = target.groupId === undefined ? 'Move tabs?' : 'Add tabs to group?';
        $('#drop-description').textContent = `${tabs.length} tab${tabs.length === 1 ? '' : 's'} → ${title.replace(/^[▢•]\s*/, '')}${target.groupId === undefined ? '' : ', ' + windowLabel(target.profileId, target.windowId)}.`;
        $('#drop-dialog').showModal();
      } catch { status('Could not read dragged tabs.'); }
    };
  }
  return button;
}
function renderNavigation(tabs) {
  const navigation = $('#navigation'), oldScroll = navigation.scrollTop; navigation.replaceChildren();
  navigation.append(navButton('▤  All tabs', tabs.length, { type: 'all' }), navButton('▱  Duplicates', duplicateKeys(tabs).size, { type: 'duplicates' }), navButton('□  Empty tabs', tabs.filter(isEmpty).length, { type: 'empty' }));
  for (const profile of profiles()) {
    navigation.append(node('div', 'profile-label', profile.name.toUpperCase()));
    for (const window of profile.windows) {
      const target = { profileId: profile.id, windowId: window.id };
      navigation.append(navButton(windowLabel(profile.id, window.id), countsCache.get(`${profile.id}:${window.id}`) || 0, { type: 'window', ...target }, target));
      const groups = new Map(); for (const tab of profile.tabs) groups.set(tab.groupId, (groups.get(tab.groupId) || 0) + 1);
      for (const group of profile.groups.filter(g => g.windowId === window.id)) navigation.append(navButton(group.title || 'Untitled group', groups.get(group.id) || 0, { type: 'group', ...target, groupId: group.id }, { ...target, groupId: group.id }, true, group.color));
    }
  }
  navigation.scrollTop = oldScroll;
}
function makeRow(tab) {
  const row = node('div', 'tab-row'); row.setAttribute('role', 'listitem'); row.draggable = true; row.tabIndex = 0; row.dataset.key = key(tab);
  const check = node('input'); check.type = 'checkbox'; check.dataset.control = 'select';
  const info = node('div', 'tab-info'), copy = node('div', 'tab-copy'), title = node('span', 'tab-title'), url = node('span', 'tab-url'), icon = node('span', 'site-icon'); copy.append(title, url); info.append(icon, copy);
  const location = node('div', 'location'), actions = node('div', 'row-actions'), focus = node('button', '', '↗'), close = node('button', '', '×');
  focus.dataset.control = 'focus'; close.dataset.control = 'close'; actions.append(focus, close); row.append(check, info, location, actions);
  const current = () => row.tab;
  check.onclick = event => { event.stopPropagation(); selectTab(current(), event, check.checked); };
  focus.onclick = event => { event.stopPropagation(); run([current()], { type: 'focus' }); };
  close.onclick = event => { event.stopPropagation(); run([current()], { type: 'close' }); };
  row.onclick = event => { if (!event.target.closest('button,input')) selectTab(current(), event); };
  row.ondblclick = event => { if (!event.target.closest('button,input')) run([current()], { type: 'focus' }); };
  row.onkeydown = event => {
    if (event.target !== row) return;
    const index = visibleCache.findIndex(t => key(t) === key(current()));
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); const next = Math.min(visibleCache.length - 1, Math.max(0, index + (event.key === 'ArrowDown' ? 1 : -1)));
      const list = $('#tab-list'); if (next * ROW_HEIGHT < list.scrollTop) list.scrollTop = next * ROW_HEIGHT; else if ((next + 1) * ROW_HEIGHT > list.scrollTop + list.clientHeight) list.scrollTop = (next + 1) * ROW_HEIGHT - list.clientHeight;
      renderRows(); rowCache.get(key(visibleCache[next]))?.focus();
    } else if (event.key === ' ') { event.preventDefault(); selectTab(current(), { ...event, ctrlKey: true }, !selected.has(key(current()))); }
    else if (event.key === 'Enter') { event.preventDefault(); run([current()], { type: 'focus' }); }
    else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); if (!selected.has(key(current()))) selected = new Set([key(current())]); confirmClose(); }
    else if (event.key === 'F10' && event.shiftKey) { event.preventDefault(); showContext(current(), row.getBoundingClientRect().x + 80, row.getBoundingClientRect().y); }
  };
  row.ondragstart = event => { const tab = current(), keys = selected.has(key(tab)) ? [...selected] : [key(tab)]; event.dataTransfer.setData('application/x-chr-tabs', JSON.stringify(keys)); event.dataTransfer.effectAllowed = 'move'; };
  row.oncontextmenu = event => { event.preventDefault(); showContext(current(), event.clientX, event.clientY); };
  row.parts = { check, title, url, icon, location, focus, close }; return row;
}
function showContext(tab, x, y) {
  contextTab = tab; if (!selected.has(key(tab))) { selected = new Set([key(tab)]); render(); }
  const menu = $('#context-menu'); menu.hidden = false; menu.style.left = `${Math.min(x, innerWidth - 210)}px`; menu.style.top = `${Math.min(y, innerHeight - 180)}px`; $('#context-focus').focus();
}
function renderRows() {
  const list = $('#tab-list'), focused = document.activeElement, focusedRow = focused?.closest('.tab-row'), focusKey = focusedRow?.dataset.key, control = focused?.dataset.control;
  const start = Math.max(0, Math.floor(list.scrollTop / ROW_HEIGHT) - 5), end = Math.min(visibleCache.length, Math.ceil((list.scrollTop + (list.clientHeight || 600)) / ROW_HEIGHT) + 5), fragment = document.createDocumentFragment();
  const spacer = height => { const div = node('div', 'list-spacer'); div.style.height = `${height}px`; div.setAttribute('aria-hidden', 'true'); return div; };
  fragment.append(spacer(start * ROW_HEIGHT));
  const activeKeys = new Set();
  for (const tab of visibleCache.slice(start, end)) {
    const id = key(tab); activeKeys.add(id);
    let row = rowCache.get(id); if (!row) { row = makeRow(tab); rowCache.set(id, row); }
    row.tab = tab; row.classList.toggle('is-selected', selected.has(id)); row.setAttribute('aria-selected', String(selected.has(id)));
    const { check, title, url, icon, location, focus, close } = row.parts;
    check.checked = selected.has(id); check.setAttribute('aria-label', `Select ${tab.title || tab.url}`);
    title.textContent = tab.title || 'Untitled tab'; title.title = tab.title || tab.url;
    const duplicate = duplicatePositions.get(id);
    row.classList.toggle('duplicate-start', !!duplicate && duplicate.index === 1);
    if (duplicate) {
      title.prepend(node('span', 'duplicate-badge', `${duplicate.index}/${duplicate.total} copies`));
      if (duplicate.index === 1) {
        const label = node('label', 'cluster-select'), checkbox = node('input'); checkbox.type = 'checkbox';
        checkbox.checked = duplicate.keys.every(id => selected.has(id));
        checkbox.indeterminate = !checkbox.checked && duplicate.keys.some(id => selected.has(id));
        checkbox.dataset.control = 'cluster';
        checkbox.setAttribute('aria-label', `Select all ${duplicate.total} copies of ${tab.url}`);
        label.append(checkbox, node('span', '', 'Select cluster'));
        label.onclick = event => event.stopPropagation(); label.ondblclick = event => event.stopPropagation();
        checkbox.onchange = () => { duplicate.keys.forEach(id => checkbox.checked ? selected.add(id) : selected.delete(id)); render(); };
        title.prepend(label);
      }
    }
    const protection = protectedReason(tab);
    if (protection) { const badge = node('span', 'protected', tab.pinned ? 'PINNED' : tab.audible ? 'AUDIO' : tab.active ? 'ACTIVE' : 'PROTECTED'); badge.title = protection; title.append(badge); }
    url.textContent = tab.url; paintFavicon(icon, tab);
    location.replaceChildren(node('div', '', `${tab.profileName} · ${windowLabel(tab.profileId, tab.windowId)}`));
    const group = profiles().find(p => p.id === tab.profileId)?.groups.find(g => g.id === tab.groupId);
    if (group) { const chip = node('span', 'group-chip', group.title || 'Untitled group'); chip.dataset.groupColor = groupColor(group.color); location.append(chip); }
    focus.title = 'Show in Chrome'; focus.disabled = busy; focus.setAttribute('aria-label', `Show ${tab.title} in Chrome`);
    close.disabled = busy || !!protection; close.title = protection || 'Close tab'; close.setAttribute('aria-label', `Close ${tab.title}`);
    fragment.append(row);
  }
  fragment.append(spacer((visibleCache.length - end) * ROW_HEIGHT));
  list.replaceChildren(fragment);
  queueFavicons(visibleCache.slice(start, end));
  for (const id of rowCache.keys()) if (!activeKeys.has(id)) rowCache.delete(id);
  if (focusKey && rowCache.has(focusKey)) { const row = rowCache.get(focusKey); const target = control ? row.querySelector(`[data-control="${control}"]`) : row; if (target && !target.disabled) target.focus({ preventScroll: true }); }
}
function render(preserveAnchor = false) {
  const list = $('#tab-list'), oldOffset = list.scrollTop % ROW_HEIGHT;
  const anchorKey = preserveAnchor && visibleCache[Math.floor(list.scrollTop / ROW_HEIGHT)] ? key(visibleCache[Math.floor(list.scrollTop / ROW_HEIGHT)]) : undefined;
  tabsCache = allTabs(); countsCache = windowCounts(tabsCache); visibleCache = filterTabs(tabsCache, search, filter);
  duplicatePositions = new Map();
  if (filter.type === 'duplicates') {
    const clusters = new Map();
    for (const tab of visibleCache) { const cluster = `${tab.profileId}:${tab.url}`; if (!clusters.has(cluster)) clusters.set(cluster, []); clusters.get(cluster).push(tab); }
    for (const cluster of clusters.values()) { const keys = cluster.map(key); cluster.forEach((tab, i) => duplicatePositions.set(key(tab), { index: i + 1, total: cluster.length, keys })); }
  }
  const existing = new Set(tabsCache.map(key)); selected = new Set([...selected].filter(id => existing.has(id)));
  renderNavigation(tabsCache);
  updateFaviconNotice();
  $('#demo-banner').hidden = !demo; $('#demo').textContent = demo ? 'Exit demo' : 'Try demo'; $('#demo').disabled = busy;
  $('#connection').textContent = demo ? 'Demo workspace' : live.length ? `${live.length} profile${live.length === 1 ? '' : 's'} connected` : 'No profiles connected';
  $('#summary').textContent = `${tabsCache.length} tabs across ${profiles().reduce((sum, p) => sum + p.windows.length, 0)} windows.`;
  if (filter.type === 'duplicates') $('#summary').textContent = 'Matching URLs are shown together within each profile. Search keeps every copy of a matching set.';
  $('#result-count').textContent = `${visibleCache.length} of ${tabsCache.length} tabs`;
  $('#select-all').checked = visibleCache.length > 0 && visibleCache.every(t => selected.has(key(t)));
  $('#select-all').indeterminate = visibleCache.some(t => selected.has(key(t))) && !$('#select-all').checked;
  $('#selection-bar').hidden = !selected.size;
  const hidden = selected.size - visibleCache.filter(t => selected.has(key(t))).length;
  $('#selection-count').textContent = `${selected.size} selected${hidden ? ` · ${hidden} hidden` : ''}`;
  for (const selector of ['#refresh', '#cleanup']) $(selector).disabled = busy || (!demo && !live.length);
  for (const selector of ['#group-selection', '#move-selection', '#close-selection']) $(selector).disabled = busy;
  $('#empty').hidden = visibleCache.length > 0; $('#tab-list').hidden = !visibleCache.length;
  $('#empty h2').textContent = tabsCache.length ? 'No tabs match this view.' : 'A calmer browser starts here.';
  $('#empty p').textContent = tabsCache.length ? 'Try another search or choose All tabs.' : 'Use Connect Chrome to bring your tabs here, or explore with sample data.';
  $('#empty-demo').hidden = tabsCache.length > 0;
  if (anchorKey) { const index = visibleCache.findIndex(t => key(t) === anchorKey); if (index >= 0) list.scrollTop = index * ROW_HEIGHT + oldOffset; }
  renderRows();
}
function demoAction(tabs, action) {
  const profile = samples[0];
  if (action.type === 'focus') { profile.tabs.filter(t => t.windowId === tabs[0].windowId).forEach(t => t.active = t.id === tabs[0].id); return { count: 1 }; }
  if (action.type === 'group' || action.type === 'move') {
    if (tabs.some(t => t.pinned)) throw new Error('Unpin selected tabs before moving them.');
    const groupId = action.type === 'move' ? -1 : action.groupId ?? Math.max(0, ...profile.groups.map(g => g.id)) + 1;
    if (action.type === 'group' && action.groupId === undefined) profile.groups.push({ id: groupId, windowId: action.windowId, title: action.title, color: 'blue' });
    for (const tab of tabs) { const current = profile.tabs.find(t => t.id === tab.id); current.windowId = action.windowId; current.groupId = groupId; }
    for (const w of profile.windows) if (!profile.tabs.some(t => t.windowId === w.id)) profile.tabs.push({ id: Math.max(...profile.tabs.map(t => t.id)) + 1, title: 'New Tab', url: 'chrome://newtab/', windowId: w.id, groupId: -1, active: true, status: 'complete' });
    profile.groups = profile.groups.filter(g => profile.tabs.some(t => t.groupId === g.id));
    return { count: tabs.length };
  }
  const closed = [], skipped = [];
  for (const tab of tabs) {
    if (closeReason(tab, flatten(samples), settings)) { skipped.push(tab); continue; }
    profile.tabs = profile.tabs.filter(t => t.id !== tab.id); closed.push({ ...tab, status: 'closed' });
  }
  if (closed.length) demoHistory.unshift({ id: crypto.randomUUID(), time: Date.now(), profileId: 'demo', profileName: 'Personal', tabs: closed });
  return { count: closed.length, skipped };
}
async function run(tabs, action) {
  if (busy || !tabs.length) return;
  busy = true; render(); let count = 0, skipped = 0;
  try {
    for (const profileId of new Set(tabs.map(t => t.profileId))) {
      const batch = tabs.filter(t => t.profileId === profileId), profile = profiles().find(p => p.id === profileId);
      if (!profile) throw new Error('Profile disconnected');
      const payload = { ...action, sessionId: batch[0].sessionId || profile.sessionId, tabs: batch.map(({ id, url }) => ({ id, url })), survivors: action.survivors?.filter(t => t.profileId === profileId).map(({ id, url }) => ({ id, url })) };
      const result = demo ? demoAction(batch, action) : await bridge.command(profileId, payload);
      count += result.count || 0; skipped += result.skipped?.length || 0;
    }
    status(`${demo ? 'Demo: ' : ''}${action.type === 'close' ? 'Closed' : action.type === 'group' ? 'Grouped' : action.type === 'move' ? 'Moved' : 'Focused'} ${count} tab${count === 1 ? '' : 's'}.${skipped ? ` ${skipped} protected or changed tabs skipped.` : ''}${action.type === 'close' && count ? ' Reopen them from Recovery.' : ''}`);
  } catch (error) { status(`${count ? `${count} tabs already processed. ` : ''}${error.message} Changes may be partial; refresh before retrying.`); }
  finally { busy = false; if (!demo && bridge) live = await bridge.profiles(); render(); }
}
function selectedTabs() { return allTabs().filter(t => selected.has(key(t))); }
function openOrganize(mode) {
  const tabs = selectedTabs(); if (!tabs.length || busy) return;
  if (new Set(tabs.map(t => t.profileId)).size > 1) return status('Select tabs from one profile to organize them.');
  organizeMode = mode; pendingOrganization = { tabs };
  $('#organize-title').textContent = mode === 'group' ? 'Create a group' : 'Move tabs'; $('#organize-description').textContent = `${tabs.length} selected tabs from ${tabs[0].profileName}.`;
  $('#group-name-label').hidden = mode !== 'group'; $('#group-name').required = mode === 'group';
  const select = $('#destination'); select.replaceChildren();
  profiles().find(p => p.id === tabs[0].profileId).windows.forEach(w => { const option = node('option', '', windowLabel(tabs[0].profileId, w.id)); option.value = w.id; select.append(option); });
  $('#organize-dialog').showModal();
}
async function saveConfirmation(name, value) {
  try { const update = { ...settings, [name]: value }; settings = demo ? update : await bridge.settings(update); return true; }
  catch (error) { status(`Could not save preference: ${error.message}`); return false; }
}
function confirmClose() {
  pendingClose = selectedTabs(); if (!pendingClose.length || busy) return;
  const eligible = pendingClose.filter(t => !protectedReason(t)); if (!eligible.length) return status('All selected tabs are protected.');
  if (settings.confirmTabClose === false) return run(pendingClose, { type: 'close' });
  $('#ask-tab-close').checked = true;
  $('#close-description').textContent = `${eligible.length} of ${pendingClose.length} selected tabs are eligible to close. The last tab in each window will be kept.`;
  $('#close-dialog').showModal();
}
async function toggleDemo() {
  if (busy) return;
  demo = !demo; if (demo) { samples = demoProfiles(); demoHistory = []; } else if (bridge) settings = await bridge.settings();
  selected.clear(); search = ''; $('#search').value = ''; chooseFilter({ type: 'all' }, 'All tabs'); status(demo ? 'Demo mode: experiment freely. No Chrome tabs will change.' : 'Live workspace.');
}
async function setup(action = 'status') {
  try {
    const result = await bridge.setup(action);
    $('#setup-status').textContent = `${result.registered ? '✓ Local bridge enabled.' : 'Local bridge is not enabled yet.'} ${result.profiles.length ? `${result.profiles.length} Chrome profile(s) connected.` : 'Waiting for the Chrome extension.'}`;
    $('#install-bridge').textContent = result.registered ? 'Repair bridge' : 'Enable bridge'; $('#remove-bridge').disabled = !result.registered;
    const container = $('#connected-profiles'); container.replaceChildren();
    for (const profile of result.profiles) {
      const form = node('form', 'profile-edit'), input = node('input'), save = node('button', '', 'Rename'); input.value = profile.name; input.maxLength = 80; input.required = true; input.setAttribute('aria-label', 'Chrome profile name');
      form.append(input, save); form.onsubmit = async event => { event.preventDefault(); try { await bridge.command(profile.id, { type: 'rename', name: input.value }); status('Profile renamed.'); } catch (error) { $('#setup-status').textContent = error.message; } }; container.append(form);
    }
  } catch (error) { $('#setup-status').textContent = error.message; }
}
function reviewCleanup() {
  proposed = cleanupPlan(allTabs(), settings); const list = $('#cleanup-list'); list.replaceChildren();
  $('#cleanup-summary').textContent = proposed.candidates.length ? `${proposed.candidates.length} tabs can be closed. At least one copy of each duplicate URL will stay open.` : 'Nothing to clean up. Your remaining tabs are unique or protected.';
  for (const tab of proposed.candidates) {
    const item = node('div', 'review-item'), checkbox = node('input'), label = node('label'); checkbox.type = 'checkbox'; checkbox.checked = true; checkbox.dataset.key = key(tab); checkbox.id = `candidate-${tab.profileId}-${tab.id}`; label.htmlFor = checkbox.id;
    label.append(node('span', 'tab-title', tab.title || tab.url), node('p', '', `${tab.reason} · ${tab.profileName} · ${windowLabel(tab.profileId, tab.windowId)}`), node('p', '', tab.url));
    if (tab.survivor) label.append(node('p', '', `Keeping: ${tab.survivor.title || tab.survivor.url} in ${windowLabel(tab.survivor.profileId, tab.survivor.windowId)}`));
    item.append(checkbox, label); list.append(item);
  }
  $('#apply-cleanup').disabled = !proposed.candidates.length; $('#cleanup-dialog').showModal();
}
async function showRecovery() {
  if (!$('#recovery-dialog').open) $('#recovery-dialog').showModal();
  const list = $('#recovery-list'); list.replaceChildren();
  try {
    const history = demo ? demoHistory : await bridge.history();
    if (!history.length) list.append(node('p', 'muted', 'No recovery records yet. Tabs closed through TabArrange will appear here.'));
    for (const batch of history) {
      const item = node('section', 'recovery-batch'), closed = batch.tabs.filter(t => t.status === 'closed'), uncertain = batch.tabs.filter(t => t.status === 'uncertain');
      item.append(node('h3', '', `${batch.profileName} · ${new Date(batch.time).toLocaleString()}`), node('p', 'muted', `${closed.length} closed · ${batch.tabs.filter(t => t.status === 'restored').length} reopened${uncertain.length ? ` · ${uncertain.length} uncertain` : ''}`));
      const details = node('details'), summary = node('summary', '', 'View recorded tabs'), ul = node('ul');
      for (const tab of batch.tabs) ul.append(node('li', '', `${tab.title || tab.url} — ${tab.status}${tab.reason ? ` (${tab.reason})` : ''}`)); details.append(summary, ul); item.append(details);
      const connected = profiles().some(p => p.id === batch.profileId);
      const reopen = (text, includeUncertain) => {
        const button = node('button', '', text); button.disabled = !connected || busy;
        button.onclick = async () => {
          busy = true; render(); button.disabled = true; $('#recovery-status').textContent = 'Reopening tabs…';
          try {
            let count;
            if (demo) {
              const records = batch.tabs.filter(t => t.status === 'closed'), profile = samples[0];
              for (const record of records) {
                if (!profile.windows.length) profile.windows.push({ id: record.windowId });
                const windowId = profile.windows.some(w => w.id === record.windowId) ? record.windowId : profile.windows[0].id;
                profile.tabs.push({ ...record, windowId, id: Math.max(0, ...profile.tabs.map(t => t.id)) + 1, active: false, status: 'complete', groupId: -1 }); record.status = 'restored';
              } count = records.length;
            } else { const result = await bridge.recover(batch.id, includeUncertain); count = result.count; }
            $('#recovery-status').textContent = `Reopened ${count} tabs.`;
          } catch (error) { $('#recovery-status').textContent = error.message; }
          finally { busy = false; if (!demo) live = await bridge.profiles(); render(); await showRecovery(); }
        }; return button;
      };
      if (closed.length) item.append(reopen('Reopen closed tabs', false));
      if (uncertain.length) { item.append(node('p', 'muted', 'Connection was interrupted. These tabs may already be open; reopening may create duplicates.'), reopen('Reopen closed + uncertain tabs', true)); }
      if (!connected && (closed.length || uncertain.length)) item.append(node('p', 'muted', 'Connect this Chrome profile to reopen its tabs.'));
      list.append(item);
    }
  } catch (error) { $('#recovery-status').textContent = error.message; }
}

async function runWindow(target, type) {
  if (!target || busy) return;
  busy = true; render();
  try {
    let result;
    if (demo) {
      const profile = samples.find(p => p.id === target.profileId);
      if (type === 'close-window') {
        const tabs = profile.tabs.filter(t => t.windowId === target.windowId);
        demoHistory.unshift({ id: crypto.randomUUID(), time: Date.now(), profileId: profile.id, profileName: profile.name, tabs: tabs.map(t => ({ ...t, status: 'closed' })) });
        profile.tabs = profile.tabs.filter(t => t.windowId !== target.windowId); profile.groups = profile.groups.filter(g => g.windowId !== target.windowId); profile.windows = profile.windows.filter(w => w.id !== target.windowId);
        result = { count: tabs.length };
      } else result = { count: 1 };
    } else result = await bridge.command(target.profileId, { ...target, type });
    if (type === 'close-window') {
      if (filter.windowId === target.windowId && filter.profileId === target.profileId) { filter = { type: 'all' }; $('#heading').textContent = 'All tabs'; }
      status(`Closed ${result.count} tabs in ${windowLabel(target.profileId, target.windowId)}.${result.skipped?.length ? ' Some tabs stayed open.' : ''} Saved URLs are available in Recovery.`);
    } else status(`Brought ${windowLabel(target.profileId, target.windowId)} to front.`);
  } catch (error) { status(error.message); }
  finally { busy = false; if (!demo) live = await bridge.profiles(); render(); }
}
$('#window-focus').onclick = () => runWindow(contextWindow, 'focus-window');
$('#window-close').onclick = () => {
  const profile = profiles().find(p => p.id === contextWindow?.profileId);
  if (!profile || busy) return;
  pendingWindowClose = { ...contextWindow, tabs: profile.tabs.filter(t => t.windowId === contextWindow.windowId).map(({ id, url }) => ({ id, url })) };
  if (settings.confirmWindowClose === false) return runWindow(pendingWindowClose, 'close-window');
  $('#ask-window-close').checked = true;
  $('#close-window-title').textContent = `Close ${windowLabel(profile.id, contextWindow.windowId)}?`;
  $('#close-window-description').textContent = `${pendingWindowClose.tabs.length} tabs in ${profile.name} will close.`;
  $('#close-window-dialog').showModal();
};
$('#confirm-close-window').onclick = async () => { if (!await saveConfirmation('confirmWindowClose', $('#ask-window-close').checked)) return; $('#close-window-dialog').close(); runWindow(pendingWindowClose, 'close-window'); };
document.addEventListener('click', () => { $('#window-menu').hidden = true; });
document.addEventListener('keydown', event => {
  if ($('#window-menu').hidden) return;
  if (event.key === 'Escape' || event.key === 'Tab') { $('#window-menu').hidden = true; }
  else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); (document.activeElement.id === 'window-focus' ? $('#window-close') : $('#window-focus')).focus(); }
});
$('#demo').onclick = toggleDemo; $('#empty-demo').onclick = toggleDemo;
$('#setup').onclick = () => { $('#setup-dialog').showModal(); setup(); };
$('#install-bridge').onclick = () => setup('register'); $('#remove-bridge').onclick = () => setup('unregister'); $('#extension-folder').onclick = () => setup('folder'); $('#extension-path').onclick = async () => { await setup('copy-path'); $('#setup-status').textContent = 'Extension folder path copied.'; };
$('#search').oninput = event => { search = event.target.value; $('#tab-list').scrollTop = 0; render(); };
$('#tab-list').onscroll = () => { if (!scrollFrame) scrollFrame = requestAnimationFrame(() => { scrollFrame = undefined; renderRows(); }); };
window.addEventListener('resize', renderRows);
$('#select-all').onchange = event => { visibleCache.forEach(t => event.target.checked ? selected.add(key(t)) : selected.delete(key(t))); render(); };
$('#clear-selection').onclick = () => { selected.clear(); render(); };
$('#group-selection').onclick = () => openOrganize('group'); $('#move-selection').onclick = () => openOrganize('move'); $('#close-selection').onclick = confirmClose;
$('#organize-form').onsubmit = event => { event.preventDefault(); $('#organize-dialog').close(); run(pendingOrganization.tabs, { type: organizeMode, windowId: Number($('#destination').value), title: $('#group-name').value.trim() || 'New group' }); };
$('#confirm-drop').onclick = () => { $('#drop-dialog').close(); run(pendingOrganization.tabs, pendingOrganization.action); };
$('#confirm-close').onclick = async () => { if (!await saveConfirmation('confirmTabClose', $('#ask-tab-close').checked)) return; $('#close-dialog').close(); run(pendingClose, { type: 'close' }); };
$('#context-focus').onclick = () => run([contextTab], { type: 'focus' }); $('#context-group').onclick = () => openOrganize('group'); $('#context-move').onclick = () => openOrganize('move'); $('#context-close').onclick = confirmClose;
$('#refresh').onclick = async () => { faviconCache.clear(); faviconFailures.clear(); updateFaviconNotice(); try { if (!demo) for (const profile of live) await bridge.command(profile.id, { type: 'refresh' }); render(); status('Workspace refreshed.'); } catch (error) { status(error.message); } };
$('#cleanup').onclick = reviewCleanup;
$('#apply-cleanup').onclick = () => { const chosen = new Set([...$('#cleanup-list').querySelectorAll('input:checked')].map(input => input.dataset.key)); $('#cleanup-dialog').close(); run(proposed.candidates.filter(t => chosen.has(key(t))), { type: 'close', automatic: true, survivors: proposed.survivors }); };
$('#recovery').onclick = () => { $('#recovery-status').textContent = ''; showRecovery(); };
$('#clear-history').onclick = () => { if (!busy) $('#clear-history-dialog').showModal(); };
$('#confirm-clear-history').onclick = async () => { try { if (demo) demoHistory = []; else await bridge.clearHistory(); $('#clear-history-dialog').close(); showRecovery(); } catch (error) { $('#recovery-status').textContent = error.message; } };
$('#settings').onclick = () => {
  $('#confirm-tab-close-setting').checked = settings.confirmTabClose !== false; $('#confirm-window-close-setting').checked = settings.confirmWindowClose !== false;
  $('#protect-active').checked = settings.protectActive; $('#protect-pinned').checked = settings.protectPinned; $('#protect-audible').checked = settings.protectAudible; $('#keep-domains').value = settings.keepDomains.join('\n'); $('#retention').value = settings.retentionDays; $('#settings-error').textContent = ''; $('#settings-dialog').showModal();
};
$('#settings-form').onsubmit = async event => {
  event.preventDefault();
  const update = { confirmTabClose: $('#confirm-tab-close-setting').checked, confirmWindowClose: $('#confirm-window-close-setting').checked, protectActive: $('#protect-active').checked, protectPinned: $('#protect-pinned').checked, protectAudible: $('#protect-audible').checked, keepDomains: $('#keep-domains').value.split(/[\s,]+/).filter(Boolean).map(s => s.toLowerCase()), retentionDays: Number($('#retention').value) };
  try { settings = demo ? update : await bridge.settings(update); $('#settings-dialog').close(); render(); status('Preferences saved.'); } catch (error) { $('#settings-error').textContent = error.message; }
};
document.querySelectorAll('[data-dismiss]').forEach(button => button.onclick = () => document.getElementById(button.dataset.dismiss).close());
document.addEventListener('click', () => $('#context-menu').hidden = true);
document.addEventListener('keydown', event => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); $('#search').focus(); }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a' && event.target.closest('#tab-list')) { event.preventDefault(); visibleCache.forEach(t => selected.add(key(t))); render(); }
  if (event.key === 'Escape') { $('#context-menu').hidden = true; if (!document.querySelector('dialog[open]')) { selected.clear(); render(); } }
});
if (bridge) {
  bridge.subscribe(value => { for (const p of value) if (!live.some(old => old.id === p.id && old.sessionId === p.sessionId)) faviconFailures.delete(p.id); live = value; if (!demo) render(true); if ($('#setup-dialog').open) setup(); });
  [live, settings] = await Promise.all([bridge.profiles(), bridge.settings()]);
}
render();
