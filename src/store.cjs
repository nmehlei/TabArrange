const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
class Store {
  constructor(directory) {
    this.file = path.join(directory, 'workspace.json'); this.log = path.join(directory, 'recovery.jsonl');
    this.state = { lastEvent: 0, settings: { confirmTabClose: true, confirmWindowClose: true, keepDomains: [], protectActive: true, protectPinned: true, protectAudible: true, retentionDays: 30 }, batches: [] };
    if (fs.existsSync(this.file)) {
      const saved = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.state.settings = { ...this.state.settings, ...saved.settings }; this.state.batches = saved.batches || []; this.state.lastEvent = saved.lastEvent || 0;
    }
    if (fs.existsSync(this.log)) {
      const lines = fs.readFileSync(this.log, 'utf8').split('\n');
      // An interrupted final append is ignored; the pre-recorded tab stays uncertain.
      for (const line of lines.slice(0, -1)) { if (!line) continue; const event = JSON.parse(line); if (event.sequence > this.state.lastEvent) this.applyEvent(event); }
    }
    for (const batch of this.state.batches) for (const tab of batch.tabs) if (tab.status === 'pending' || tab.status === 'restoring') tab.status = 'uncertain';
    this.prune();
  }
  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 });
    const temp = this.file + '.tmp'; fs.writeFileSync(temp, JSON.stringify(this.state), { mode: 0o600 }); fs.renameSync(temp, this.file);
    // Snapshot carries a sequence watermark, so replay after a crash between these writes is idempotent.
    fs.writeFileSync(this.log, '', { mode: 0o600 });
  }
  applyEvent(event) {
    const batch = this.state.batches.find(b => b.id === event.batchId);
    if (batch) for (const tab of batch.tabs) {
      if (event.result.closed?.some(t => t.id === tab.id && t.url === tab.url)) tab.status = 'closed';
      if (event.result.restored?.some(t => t.id === tab.id)) tab.status = 'restored';
      const skipped = event.result.skipped?.find(t => t.id === tab.id);
      if (skipped) { tab.status = skipped.previousStatus || 'skipped'; tab.reason = skipped.reason; }
    }
    this.state.lastEvent = event.sequence;
  }
  append(batchId, result) {
    const event = { sequence: this.state.lastEvent + 1, batchId, result };
    fs.appendFileSync(this.log, JSON.stringify(event) + '\n', { mode: 0o600 }); this.applyEvent(event);
  }
  prune() { this.state.batches = this.state.batches.filter(b => Date.now() - b.time < this.state.settings.retentionDays * 86400000); this.save(); }
  settings(update) {
    if (update) {
      const days = Number(update.retentionDays);
      if (![7, 30, 90].includes(days) || !Array.isArray(update.keepDomains) || update.keepDomains.length > 100 || update.keepDomains.some(s => typeof s !== 'string' || !/^[a-z0-9.-]+$/i.test(s))) throw new Error('Enter domains such as example.com (without URLs), and a valid retention period.');
      for (const key of ['protectActive', 'protectPinned', 'protectAudible']) if (typeof update[key] !== 'boolean') throw new Error('Invalid protection settings');
      for (const key of ['confirmTabClose', 'confirmWindowClose']) if (update[key] !== undefined && typeof update[key] !== 'boolean') throw new Error('Invalid confirmation preference');
      this.state.settings = { confirmTabClose: update.confirmTabClose ?? this.state.settings.confirmTabClose, confirmWindowClose: update.confirmWindowClose ?? this.state.settings.confirmWindowClose, keepDomains: [...new Set(update.keepDomains.map(s => s.toLowerCase()))], retentionDays: days, protectActive: update.protectActive, protectPinned: update.protectPinned, protectAudible: update.protectAudible }; this.prune();
    }
    return structuredClone(this.state.settings);
  }
  begin(profile, tabs) {
    this.prune();
    const batch = { id: crypto.randomUUID(), time: Date.now(), profileId: profile.id, profileName: profile.name, sessionId: profile.sessionId, tabs: tabs.map(t => ({ id: t.id, url: t.url, title: t.title, index: t.index, windowId: t.windowId, groupId: t.groupId, status: 'pending' })) };
    this.state.batches.unshift(batch); this.save(); return batch.id;
  }
  progress(id, result) { this.append(id, result); }
  restoreProgress(id, result, originals) { this.append(id, { ...result, skipped: result.skipped?.map(tab => ({ ...tab, previousStatus: originals.get(tab.id) })) }); }
  finish(id) { const batch = this.state.batches.find(b => b.id === id); if (!batch) return; for (const tab of batch.tabs) if (tab.status === 'pending') tab.status = 'uncertain'; this.save(); }
  history() { this.prune(); return structuredClone(this.state.batches); }
  clear() { this.state.batches = []; this.save(); }
}
module.exports = { Store };
