# Versioning, CI, and GitHub releases

## Source and identity

Both desktop (`src/`) and extension (`extension/`) live in this repository. Chrome
installs a copied extension folder; editing that folder does not update source.
Do not commit `node_modules`, `dist`, local browser profiles, runtime data, tokens,
credentials, or recovery records. The extension manifest's `key` is deliberately
public; it is not a secret signing key and must remain stable.

The user authorized personal account `nmehlei` and remote
`https://github.com/nmehlei/TabArrange.git`. Use repository-local author settings
and interactive authentication; never change global Git identity or use a company
account. Preserve the destination repository's visibility. License selection is
separate from authorization to push source.

## GitVersion 5.x Mainline

`.config/dotnet-tools.json` pins GitVersion.Tool **5.12.0**. `GitVersion.yml` uses
**Mainline**, branch `main`, `v` release tags, and patch increments by default.
Seed the initial repository commit with `git tag v0.3.0` and push that tag with
`main` on the first push. This one-time baseline preserves the current development
version; subsequent tags are created automatically after successful builds. Do not
set `next-version`: in GitVersion 5.12 Mainline it can suppress expected increments.
Never replace this config with GitVersion 6 syntax (`Mainline` is different there).

Use commit messages (or squash-merge titles/messages) to request increments:

| Message marker | Effect |
| --- | --- |
| none | Patch on main |
| `+semver: minor` | Minor increment |
| `+semver: major` | Major increment |
| `+semver: none` | No increment; no new release when that version is already tagged |

Feature prefixes include `feature/`, `feat/`, `fix/`, `chore/`, `docs/`, `codex/`.
PR/feature versions are previews; only stable main builds publish releases. Do not
make manual release tags after the one-time initial baseline or commit generated version changes back
to main. The checked-in package versions are development fallbacks; CI stamps them.

The version job checks out full history (`fetch-depth: 0`) and runs GitVersion once.
`node scripts/version.cjs --apply VERSION` sets package.json, package-lock.json's
root and root package, and extension version together. Chrome requires a numeric
manifest version, so a preview such as `0.4.1-example.1` has manifest `version`
`0.4.1` and `version_name` `0.4.1-example.1`. Preview extension builds are for isolated
profiles, not a monotonically updated Web Store channel.

## Workflow

`.github/workflows/verify.yml` runs for branch pushes, pull requests, and manual
workflow dispatch. Main runs are serialized; other branches cancel superseded runs.

1. Ubuntu version job: .NET 8 with `DOTNET_ROLL_FORWARD=Major`, restore the pinned
   GitVersion 5.12 tool, exercise temporary-history version tests, calculate version.
2. Build matrix: macOS 15 ARM64, macOS 15 Intel x64, Windows 2022 x64. Install Node 24
   dependencies, stamp version, run checks/unit/UI/performance/bridge/real-Chrome
   tests, build installers, then test the packaged native host and packaged Chrome
   integration. No Apple/Windows signing secrets are required.
3. Extension job: stamp the same version and ZIP the complete extension with its
   manifest at archive root. It is also copied into each desktop build by
   electron-builder's `extraResources` configuration.
4. Release job: only push/manual runs on `main`, and only after all builds/tests
   succeed. Download all artifacts, verify the six expected assets, generate
   SHA256SUMS.txt, tag the exact tested commit, upload to a draft release, then publish.

Expected assets:

- `TabArrange-VERSION-mac-arm64.dmg` and `.zip`
- `TabArrange-VERSION-mac-x64.dmg` and `.zip`
- `TabArrange-VERSION-win-x64.exe`
- `TabArrange-Bridge-VERSION.zip`
- `SHA256SUMS.txt`

Only the release job has `contents: write`; PR jobs cannot publish. No repository
secret/PAT is needed: release operations use the job's `GITHUB_TOKEN`. Keep code
execution in ordinary `pull_request`, never privileged `pull_request_target`.

## Retry and failure behavior

Missing assets stop publication before tag creation. A failed upload leaves a draft
release and tag; rerunning the same commit replaces incomplete draft assets and
publishes only after all uploads succeed. Already-published releases are left
unchanged. A version tag belonging to another commit is not moved or overwritten;
this is the expected no-release path for `+semver: none` changes. Use a normal or
explicit incrementing commit to publish another version.

Branch protection/rulesets must permit the workflow to create `v*` tags and releases.
Otherwise the job fails visibly; do not add a personal access token as a workaround
without considering the repository settings. No workflow is yet proven on GitHub
until the personal repository exists and its first complete run succeeds.

## Local verification

With .NET SDK 8 installed:

```sh
DOTNET_ROLL_FORWARD=Major dotnet tool restore
npm run test:versioning
npm run version:calculate
```

PowerShell: set `$env:DOTNET_ROLL_FORWARD = 'Major'` before restoring/running.
Calculation requires a Git checkout with full history. The version smoke test uses
a temporary repository and works even before this working directory is initialized.
`npm run version:apply -- 0.3.1` changes local manifests for a test build; do not commit
that generated bump. `npm run dist` builds locally but never publishes by itself.

## Remaining decisions and actual-machine checks

- The open-source license is pending maintainer selection. Public source without
  a license is not an open-source license grant.
- CI tests are not installer UX tests: verify macOS downloaded/quarantined first
  launch, Windows install/uninstall, and extension setup on real machines.
- No paid Apple account will be used. macOS is ad-hoc signed and not notarized;
  Windows installers are unsigned. This limitation must remain visible in releases.

References: [GitVersion 5.12 configuration](https://gitversion.net/5.12.0/docs/reference/configuration),
[Mainline mode](https://gitversion.net/5.12.0/docs/reference/modes/mainline),
[full-history requirements](https://gitversion.net/5.12.0/docs/reference/requirements).
