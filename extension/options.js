// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 nmehlei
chrome.storage.local.get('profile').then(({ profile }) => { document.querySelector('#name').value = profile?.name || ''; });
document.querySelector('form').addEventListener('submit', async event => {
  event.preventDefault();
  const { profile } = await chrome.storage.local.get('profile');
  await chrome.storage.local.set({ profile: { id: profile?.id || crypto.randomUUID(), name: document.querySelector('#name').value.trim() || 'Chrome profile' } });
  document.querySelector('#status').textContent = 'Saved. The desktop app will update automatically.';
});
function connectionStatus(connection) { document.querySelector('#connection').textContent = connection?.connected ? 'Connected to the desktop app' : connection?.error || 'Desktop app is not connected'; }
chrome.storage.session.get('connection').then(({ connection }) => connectionStatus(connection));
chrome.storage.onChanged.addListener((changes, area) => { if (area === 'session' && changes.connection) connectionStatus(changes.connection.newValue); });
