const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
function applyVersion(version, root = path.resolve(__dirname, '..')) {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.exec(version);
  if (!match || match.slice(1, 4).some(n => Number(n) > 65535) || match.slice(1, 4).every(n => Number(n) === 0)) throw new Error('Expected a Chrome-compatible SemVer (nonzero, each numeric component <= 65535)');
  const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
  const pkg = read('package.json'), lock = read('package-lock.json'), extension = read('extension/manifest.json');
  pkg.version = lock.version = lock.packages[''].version = version;
  extension.version = match.slice(1, 4).join('.');
  extension.version_name = version;
  for (const [file, data] of [['package.json', pkg], ['package-lock.json', lock], ['extension/manifest.json', extension]]) fs.writeFileSync(path.join(root, file), JSON.stringify(data, null, 2) + '\n');
  return { version, extensionVersion: extension.version };
}
function calculateVersion(root = path.resolve(__dirname, '..')) {
  const output = execFileSync('dotnet', ['tool', 'run', 'dotnet-gitversion', '--', '/output', 'json', '/nofetch', '/config', path.join(root, 'GitVersion.yml')], {
    cwd: root, encoding: 'utf8', env: { ...process.env, DOTNET_ROLL_FORWARD: 'Major' }, stdio: ['ignore', 'pipe', 'inherit']
  });
  const data = JSON.parse(output);
  if (!data.SemVer || !data.Sha) throw new Error('GitVersion did not return a version and commit SHA');
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `semver=${data.SemVer}\nsha=${data.Sha}\n`);
  console.log(JSON.stringify({ semver: data.SemVer, sha: data.Sha }, null, 2));
  return data;
}
if (require.main === module) {
  if (process.argv[2] === '--apply') console.log(JSON.stringify(applyVersion(process.argv[3])));
  else calculateVersion();
}
module.exports = { applyVersion, calculateVersion };
