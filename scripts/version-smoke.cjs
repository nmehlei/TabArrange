// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 nmehlei
// Exercise the real pinned GitVersion against disposable history, never this checkout.
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'tabarrange-version-'));
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(GITHUB_|GIT_|BUILD_|TF_BUILD|CI$)/.test(key)));
env.DOTNET_ROLL_FORWARD = 'Major';
const git = (...args) => execFileSync('git', args, { cwd: fixture, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
let tick = 0;
const commit = message => {
  env.GIT_AUTHOR_DATE = env.GIT_COMMITTER_DATE = new Date(Date.UTC(2025, 0, 1, 0, ++tick)).toISOString();
  fs.appendFileSync(path.join(fixture, 'history.txt'), message + '\n');
  git('add', 'history.txt');
  return git('-c', 'user.name=Version Test', '-c', 'user.email=version-test@example.invalid', 'commit', '-m', message);
};
const version = () => JSON.parse(execFileSync('dotnet', ['tool', 'run', 'dotnet-gitversion', '--', fixture, '/output', 'json', '/nofetch', '/config', path.join(fixture, 'GitVersion.yml')], { cwd: root, env, encoding: 'utf8' })).SemVer;
git('init', '-b', 'main');
fs.copyFileSync(path.join(root, 'GitVersion.yml'), path.join(fixture, 'GitVersion.yml'));
git('add', 'GitVersion.yml'); commit('Initial version');
git('tag', 'v0.3.0');
assert.equal(version(), '0.3.0');
commit('Fix a bug'); assert.equal(version(), '0.3.1');
git('tag', 'v0.3.1'); commit('Documentation +semver: none'); assert.equal(version(), '0.3.1');
commit('New capability +semver: minor'); assert.equal(version(), '0.4.0');
git('tag', 'v0.4.0'); git('checkout', '-b', 'feature/example'); commit('Feature work');
assert.match(version(), /^0\.4\.1-example\.\d+$/);
git('checkout', 'main');
git('-c', 'user.name=Version Test', '-c', 'user.email=version-test@example.invalid', 'merge', '--no-ff', 'feature/example', '-m', 'Merge feature +semver: minor');
assert.equal(version(), '0.5.0');
commit('Breaking change +semver: major'); assert.equal(version(), '1.0.0');
console.log('GitVersion 5.12 Mainline passed: bootstrap, patch, none, minor, feature, merge, major. Fixture: ' + fixture);
