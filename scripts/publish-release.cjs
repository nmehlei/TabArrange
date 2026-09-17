// Invoked only by the main-branch release job through actions/github-script.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
async function publishRelease({ github, context, core, version = process.env.RELEASE_VERSION, directory = path.resolve('release') }) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Only stable mainline versions can be published');
  const { owner, repo } = context.repo, tag = `v${version}`, sha = context.sha;
  const expected = [
    `TabArrange-${version}-mac-arm64.dmg`, `TabArrange-${version}-mac-arm64.zip`,
    `TabArrange-${version}-mac-x64.dmg`, `TabArrange-${version}-mac-x64.zip`,
    `TabArrange-${version}-win-x64.exe`, `TabArrange-Bridge-${version}.zip`
  ];
  // Do not tag or create an incomplete release if a build artifact is missing.
  for (const name of expected) if (!fs.statSync(path.join(directory, name)).isFile()) throw new Error(`Missing release file: ${name}`);
  const checksums = expected.map(name => `${crypto.createHash('sha256').update(fs.readFileSync(path.join(directory, name))).digest('hex')}  ${name}`).join('\n') + '\n';
  fs.writeFileSync(path.join(directory, 'SHA256SUMS.txt'), checksums);
  let ref;
  try { ref = (await github.rest.git.getRef({ owner, repo, ref: `tags/${tag}` })).data; }
  catch (error) { if (error.status !== 404) throw error; }
  if (ref) {
    let object = ref.object;
    while (object.type === 'tag') object = (await github.rest.git.getTag({ owner, repo, tag_sha: object.sha })).data.object;
    if (object.sha !== sha) { core.notice(`${tag} already belongs to another commit. No new version (for example +semver: none); release unchanged.`); return; }
  } else await github.rest.git.createRef({ owner, repo, ref: `refs/tags/${tag}`, sha });
  let release;
  try { release = (await github.rest.repos.getReleaseByTag({ owner, repo, tag })).data; }
  catch (error) { if (error.status !== 404) throw error; }
  if (release && !release.draft) { core.notice(`${tag} is already published; leaving its assets unchanged.`); return; }
  if (!release) {
    const notes = (await github.rest.repos.generateReleaseNotes({ owner, repo, tag_name: tag, target_commitish: sha })).data.body;
    release = (await github.rest.repos.createRelease({ owner, repo, tag_name: tag, target_commitish: sha, name: `TabArrange ${version}`, draft: true, prerelease: false,
      body: `Desktop installers for macOS Apple Silicon, macOS Intel, and Windows x64.\n\nThe companion Chrome extension is bundled in the app and also attached as a ZIP. Use the app's Connect Chrome setup to install it. macOS builds are ad-hoc signed without notarization; Windows builds are unsigned.\n\n${notes}` })).data;
  }
  const assets = await github.paginate(github.rest.repos.listReleaseAssets, { owner, repo, release_id: release.id, per_page: 100 });
  for (const name of [...expected, 'SHA256SUMS.txt']) {
    const existing = assets.find(asset => asset.name === name);
    if (existing) await github.rest.repos.deleteReleaseAsset({ owner, repo, asset_id: existing.id });
    const data = fs.readFileSync(path.join(directory, name));
    await github.rest.repos.uploadReleaseAsset({ owner, repo, release_id: release.id, name, data, headers: { 'content-type': 'application/octet-stream', 'content-length': data.length } });
  }
  await github.rest.repos.updateRelease({ owner, repo, release_id: release.id, draft: false, make_latest: 'true' });
  core.notice(`Published ${tag} with all installers, companion extension, and SHA256 checksums.`);
}
module.exports = publishRelease;
