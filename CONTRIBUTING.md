# Contributing

Use Node.js 22+ and run `npm ci`. Keep changes focused and add tests for meaningful behavior, particularly anything that closes, moves, or restores tabs.

Run the checks in README.md before proposing a change. Use only isolated browser profiles for destructive integration tests. Never use personal browsing sessions as fixtures or include browsing metadata, tokens, or recovery files in bug reports.

The extension key is intentionally a public key that fixes its development ID; do not regenerate it casually. Changing it changes the native-host allowlist and users' extension identity.

Windows and Intel macOS changes require those CI jobs to pass. Keep the no-paid-Apple-account constraint and avoid adding cloud services or telemetry.

The app and extension are licensed under [GPLv3 only](LICENSE). Contributions are accepted under the same terms; include attribution and compatible license notices for any third-party code. Do not include code you lack permission to contribute.

Start with [AGENTS.md](AGENTS.md), [architecture](docs/architecture.md), and [product spec](docs/product-spec.md). Releases use pinned GitVersion 5.12 Mainline; follow [the release guide](docs/releasing.md) rather than manually bumping manifests.
