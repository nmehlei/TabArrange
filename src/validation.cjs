// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 nmehlei
function validSnapshot(m) {
  return m && typeof m.profile?.id === 'string' && m.profile.id.length <= 100 && typeof m.profile.name === 'string' && m.profile.name.length <= 100 && typeof m.sessionId === 'string' && m.sessionId.length <= 100 && Array.isArray(m.windows) && m.windows.length <= 10000 && m.windows.every(w => Number.isInteger(w.id)) && Array.isArray(m.groups) && m.groups.length <= 50000 && m.groups.every(g => Number.isInteger(g.id) && Number.isInteger(g.windowId) && typeof g.title === 'string') && Array.isArray(m.tabs) && m.tabs.length <= 50000 && m.tabs.every(t => Number.isInteger(t.id) && Number.isInteger(t.windowId) && typeof t.url === 'string' && typeof t.title === 'string' && t.url.length <= 200000 && t.title.length <= 20000) && new Set(m.tabs.map(t => t.id)).size === m.tabs.length;
}
function validateAction(action, profile) {
  if (!action || !['close', 'focus', 'group', 'move', 'refresh', 'rename', 'favicons', 'focus-window', 'close-window'].includes(action.type)) throw new Error('Unknown action');
  if (action.type === 'refresh') return;
  if (action.type === 'rename') { if (typeof action.name !== 'string' || !action.name.trim() || action.name.length > 80) throw new Error('Enter a profile name (1–80 characters)'); return; }
  if (action.sessionId !== profile.sessionId) throw new Error('Chrome restarted. Review the refreshed tab list.');
  if (['focus-window', 'close-window'].includes(action.type)) {
    if (!Number.isInteger(action.windowId) || !profile.windows.some(w => w.id === action.windowId)) throw new Error('Window is no longer available');
    if (action.type === 'focus-window') return;
    const current = profile.tabs.filter(t => t.windowId === action.windowId);
    if (!Array.isArray(action.tabs) || action.tabs.length !== current.length || current.some(t => !action.tabs.some(expected => expected.id === t.id && expected.url === t.url))) throw new Error('Window contents changed. Review and confirm again.');
  }
  if (!Array.isArray(action.tabs) || !action.tabs.length || action.tabs.length > 5000 || new Set(action.tabs.map(t => t.id)).size !== action.tabs.length) throw new Error('Select between 1 and 5,000 unique tabs');
  for (const tab of action.tabs) if (!Number.isInteger(tab.id) || typeof tab.url !== 'string' || !profile.tabs.some(t => t.id === tab.id && t.url === tab.url)) throw new Error('A selected tab changed. Refresh and try again.');
  if (action.type === 'favicons' && action.tabs.length > 32) throw new Error('Request at most 32 visible favicons');
  if (action.type === 'focus' && action.tabs.length !== 1) throw new Error('Focus one tab at a time');
  if (['group', 'move'].includes(action.type)) {
    if (!Number.isInteger(action.windowId) || !profile.windows.some(w => w.id === action.windowId)) throw new Error('Destination window is no longer available');
    if (action.groupId !== undefined && (!Number.isInteger(action.groupId) || !profile.groups.some(g => g.id === action.groupId && g.windowId === action.windowId))) throw new Error('Destination group changed');
    if (action.title !== undefined && (typeof action.title !== 'string' || action.title.length > 100)) throw new Error('Group names must be at most 100 characters');
  }
}
module.exports = { validSnapshot, validateAction };
