// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 nmehlei
export const key = tab => `${tab.profileId}:${tab.sessionId ? tab.sessionId + ":" : ""}${tab.id}`;
export function flatten(profiles) {
  return profiles.flatMap(profile => profile.tabs.map(tab => ({ ...tab, profileId: profile.id, profileName: profile.name, sessionId: profile.sessionId })));
}
export function duplicateKeys(tabs) {
  const buckets = new Map();
  for (const tab of tabs) {
    if (!/^https?:\/\//.test(tab.url)) continue;
    const bucket = `${tab.profileId}:${tab.url}`;
    if (!buckets.has(bucket)) buckets.set(bucket, []);
    buckets.get(bucket).push(tab);
  }
  return new Set([...buckets.values()].filter(group => group.length > 1).flat().map(key));
}
export function isEmpty(tab) {
  return tab.status !== 'loading' && !tab.pendingUrl && ['chrome://newtab/', 'chrome://newtab', 'chrome://new-tab-page/', 'about:blank'].includes(tab.url);
}
export function filterTabs(tabs, search, filter, duplicates = duplicateKeys(tabs)) {
  const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = tab => words.every(word => `${tab.title} ${tab.url} ${tab.profileName}`.toLowerCase().includes(word));
  if (filter.type === 'duplicates') {
    const buckets = new Map();
    for (const tab of tabs) {
      if (!duplicates.has(key(tab))) continue;
      const id = `${tab.profileId}:${tab.url}`;
      if (!buckets.has(id)) buckets.set(id, []);
      buckets.get(id).push(tab);
    }
    // Search matches a cluster, so differently titled copies remain visible together.
    return [...buckets.values()].filter(group => group.some(matches)).flat();
  }
  return tabs.filter(tab => {
    const haystack = `${tab.title} ${tab.url} ${tab.profileName}`.toLowerCase();
    return words.every(word => haystack.includes(word)) &&
      (filter.type !== 'duplicates' || duplicates.has(key(tab))) &&
      (filter.type !== 'empty' || isEmpty(tab)) &&
      (!filter.profileId || tab.profileId === filter.profileId) &&
      (filter.windowId === undefined || tab.windowId === filter.windowId) &&
      (filter.groupId === undefined || tab.groupId === filter.groupId);
  });
}
export const defaultSettings = { confirmTabClose: true, confirmWindowClose: true, keepDomains: [], protectActive: true, protectPinned: true, protectAudible: true, retentionDays: 30 };
export function closeReason(tab, tabs, settings = defaultSettings, counts) {
  if (settings.protectPinned && tab.pinned) return 'Pinned tab';
  if (settings.protectActive && tab.active) return 'Active tab';
  if (settings.protectAudible && tab.audible) return 'Playing audio';
  if (tab.status === 'loading' || tab.pendingUrl) return 'Loading tab';
  try {
    const host = new URL(tab.url).hostname;
    if (settings.keepDomains.some(domain => host === domain || host.endsWith('.' + domain))) return 'Always-keep domain';
  } catch { /* Internal pages have no matching domain. */ }
  const count = counts ? counts.get(`${tab.profileId}:${tab.windowId}`) : tabs.filter(other => other.profileId === tab.profileId && other.windowId === tab.windowId).length;
  if (count <= 1) return 'Last tab in window';
  return '';
}
export function windowCounts(tabs) {
  const counts = new Map();
  for (const tab of tabs) { const id = `${tab.profileId}:${tab.windowId}`; counts.set(id, (counts.get(id) || 0) + 1); }
  return counts;
}
export function cleanupPlan(tabs, settings = defaultSettings) {
  const counts = windowCounts(tabs), buckets = new Map(), candidates = [], survivors = [];
  const protectedTab = tab => !!closeReason(tab, tabs, settings, counts) || tab.groupId >= 0;
  for (const tab of tabs) {
    if (isEmpty(tab) && !protectedTab(tab)) candidates.push({ ...tab, reason: 'Empty tab' });
    if (/^https?:\/\//.test(tab.url)) {
      const bucket = `${tab.profileId}:${tab.url}`;
      if (!buckets.has(bucket)) buckets.set(bucket, []);
      buckets.get(bucket).push(tab);
    }
  }
  for (const bucket of buckets.values()) {
    if (bucket.length < 2) continue;
    bucket.sort((a, b) => Number(protectedTab(b)) - Number(protectedTab(a)) || (b.lastAccessed || 0) - (a.lastAccessed || 0) || a.id - b.id);
    const survivor = bucket[0]; survivors.push(survivor);
    for (const tab of bucket.slice(1)) if (!protectedTab(tab)) candidates.push({ ...tab, reason: 'Exact duplicate', survivor });
  }
  // Never propose closing every tab of any window, even when active protection is disabled.
  const remaining = new Map(counts);
  return { survivors, candidates: candidates.filter(tab => {
    const id = `${tab.profileId}:${tab.windowId}`;
    if (remaining.get(id) <= 1) return false;
    remaining.set(id, remaining.get(id) - 1); return true;
  }) };
}
export function demoProfiles() {
  const definitions = [
    ['mydealz – Die besten Deals', 'https://www.mydealz.de/', 1, -1],
    ['Sony WH-1000XM5 Kopfhörer', 'https://www.mydealz.de/deals/sony-wh1000xm5', 1, 10],
    ['Dell UltraSharp Monitor', 'https://www.mydealz.de/deals/dell-ultrasharp', 2, -1],
    ['mydealz – Die besten Deals', 'https://www.mydealz.de/', 2, -1],
    ['Design systems collection', 'https://www.figma.com/community', 1, 11],
    ['A guide to better typography', 'https://www.smashingmagazine.com/typography/', 1, 11],
    ['GitHub · Explore', 'https://github.com/explore', 2, -1],
    ['New Tab', 'chrome://newtab/', 2, -1],
    ['New Tab', 'chrome://newtab/', 1, -1],
    ['Weekend in Copenhagen', 'https://www.visitcopenhagen.com/', 3, 12],
    ['Copenhagen restaurants', 'https://www.google.com/search?q=copenhagen+restaurants', 3, 12],
    ['Bandcamp · Discover', 'https://bandcamp.com/discover', 3, -1],
    ['GitHub · Explore', 'https://github.com/explore', 1, -1],
    ['Reading list', 'https://example.org/reading', 3, -1]
  ];
  return [{ id: 'demo', name: 'Personal', sessionId: 'demo-session', windows: [{ id: 1 }, { id: 2 }, { id: 3 }], groups: [{ id: 10, windowId: 1, title: 'Shopping', color: 'blue' }, { id: 11, windowId: 1, title: 'Design inspiration', color: 'purple' }, { id: 12, windowId: 3, title: 'Copenhagen', color: 'green' }], tabs: definitions.map(([title, url, windowId, groupId], index) => ({ id: index + 1, title, url, windowId, groupId, index, status: 'complete', active: [0, 6, 9].includes(index), pinned: index === 4, audible: index === 11 })) }];
}
