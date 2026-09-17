<p align="center">
  <img src="build/icon.svg" width="112" height="112" alt="TabArrange icon">
</p>
<h1 align="center">TabArrange</h1>
<p align="center"><strong>A little order for a lot of Chrome tabs.</strong></p>
<p align="center">Search, group, and clean up your Chrome workspace from one desktop app.</p>
<p align="center">
  <a href="https://github.com/nmehlei/TabArrange/actions/workflows/verify.yml"><img src="https://github.com/nmehlei/TabArrange/actions/workflows/verify.yml/badge.svg" alt="Build, test, and release"></a>
  <a href="https://github.com/nmehlei/TabArrange/releases"><img src="https://img.shields.io/github/v/release/nmehlei/TabArrange?label=release" alt="Latest release"></a>
</p>
<p align="center">
  <a href="https://github.com/nmehlei/TabArrange/releases">Download</a> ·
  <a href="docs/usage.md">User guide</a> ·
  <a href="CONTRIBUTING.md">Contribute</a> ·
  <a href="https://github.com/nmehlei/TabArrange/issues">Report a bug</a>
</p>

## Give your tabs some breathing room

When windows multiply and “I'll read this later” becomes hundreds of tabs, finding anything gets difficult. TabArrange brings connected Chrome profiles, windows, groups, and tabs into one searchable workspace on **macOS and Windows**.

- **Find anything quickly.** Search titles, URLs, and profile names; filter by window, group, empty tabs, or duplicates.
- **See duplicates together.** Exact URL matches stay clustered, with controls to select a whole cluster or individual copies.
- **Organize with drag and drop.** Move tabs between windows and into Chrome groups, keeping familiar group colors and favicons.
- **Clean up with a review.** Preview suggested closures and the copies that will remain. Protect active, pinned, audible, and always-keep tabs.
- **Recover closed URLs.** Reopen tabs closed through TabArrange from its local recovery history.
- **Make room for your workspace.** Resize the sidebar, use keyboard shortcuts, and choose light, dark, or system appearance.

Browser data stays on your computer. No account, cloud backend, telemetry, or remote debugging is required. The desktop app and companion Chrome extension live in this repository.

## Get started

Download a build from [Releases](https://github.com/nmehlei/TabArrange/releases):

| Platform | Download |
| --- | --- |
| macOS Apple Silicon | `TabArrange-VERSION-mac-arm64.dmg` |
| macOS Intel | `TabArrange-VERSION-mac-x64.dmg` |
| Windows x64 | `TabArrange-VERSION-win-x64.exe` |

Release builds become available after CI completes successfully. macOS ZIPs, the standalone extension ZIP, and SHA256 checksums are included too. Installers include the runtime and extension; Node.js is not needed.

1. Install the app. On macOS, move it to **Applications** before connecting Chrome.
2. Open **⋯ → Connect Chrome → Enable bridge** in TabArrange.
3. Open `chrome://extensions`, enable **Developer mode**, and choose **Load unpacked**.
4. Select the folder shown by **Show extension folder** or **Copy folder path** in TabArrange.
5. Click the extension's toolbar icon, or wait up to 30 seconds for your tabs to appear.

Repeat the extension setup for each Chrome profile you want to connect. The extension is not yet in the Chrome Web Store; managed Chrome installations may restrict unpacked extensions. After an upgrade, use **Repair bridge** and reload the extension if needed.

**Signing:** macOS builds are ad-hoc signed and not notarized; Windows installers are unsigned. Your operating system may require additional confirmation to launch a downloaded build. See the [installation guide](docs/usage.md#packaged-app) for details.

Want to look around first? Run from source and choose **Try demo** to explore sample tabs.

## A few useful shortcuts

| Action | Shortcut |
| --- | --- |
| Search | Cmd/Ctrl+K |
| Navigate rows | Arrow keys |
| Toggle selection | Space |
| Select visible results | Cmd/Ctrl+A |
| Show tab in Chrome | Enter |
| Review closing selected tabs | Delete |
| Open context menu | Shift+F10 |

See the [user guide](docs/usage.md) for selection, cleanup, recovery, profiles, and uninstall instructions.

## Safety and scope

Ordinary tab closures recheck protections inside Chrome and preserve the final tab in a window. Explicit **Close window** is a separate action with its own confirmation settings and includes protected tabs. Duplicate cleanup matches complete URLs within each profile and keeps a surviving copy.

Recovery restores **URLs**, not unsaved forms, page state, or browsing history. Interrupted operations can be partially applied; uncertain closure outcomes are shown separately. Incognito windows and profiles without the extension are not accessible. Cross-profile moves and per-tab CPU/memory metrics are not supported.

Recovery records contain tab titles and URLs and remain in `~/.chr-organizer` on your computer. The legacy folder name is retained for compatibility. See [local data and uninstall](docs/usage.md#local-data-and-uninstall) and [SECURITY.md](SECURITY.md).

## Develop locally

Use Node.js **24** (22+ for ordinary development) and npm:

```sh
git clone https://github.com/nmehlei/TabArrange.git
cd TabArrange
npm ci
npm start
```

The app uses Electron with a sandboxed renderer. A Manifest V3 extension communicates through Chrome native messaging and a local Unix socket or Windows named pipe. There is no listening TCP port. Both sides are included: [`src/`](src/) and [`extension/`](extension/).

```sh
npm run check
npm test
npm run test:ui
npm run test:performance
npm run test:bridge
npm run browser:install
npm run test:chrome
npm run dist
npm run test:packaged-host
npm run test:chrome:packaged
```

Browser integration tests use isolated Chrome for Testing profiles and synthetic pages, never your everyday browser session. `npm run dist` creates local installers without publishing them; `npm run pack` builds just the app directory.

## Releases and versioning

[GitHub Actions](.github/workflows/verify.yml) tests and builds macOS ARM64, macOS Intel, and Windows x64. Successful `main` builds publish installers, the companion extension, and checksums to GitHub Releases. Pull requests produce build artifacts without publishing releases.

Versions come from **GitVersion 5.12.0 in Mainline mode**. Ordinary commits increment the patch version; `+semver: minor`, `+semver: major`, and `+semver: none` control other increments. CI stamps both app and extension versions. See [the release guide](docs/releasing.md) for setup and retry behavior.

## Contributing

Bug reports, usability feedback, documentation improvements, and focused pull requests are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md), use synthetic browser data in reports, and keep destructive tests isolated from real tabs.

- [Architecture](docs/architecture.md) — source map, protocol, storage, and compatibility.
- [Product specification](docs/product-spec.md) — expected behavior and safeguards.
- [Roadmap](PLAN.md) — remaining work and verification gates.
- [AGENTS.md](AGENTS.md) / [CLAUDE.md](CLAUDE.md) — handoff instructions for coding agents.

## License

A license is pending the maintainer's selection. Until a license is added, this repository does not grant open-source reuse rights.

---

TabArrange is an independent project and is not affiliated with or endorsed by Google. Google Chrome is a trademark of Google LLC.
