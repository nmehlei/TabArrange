# TabArrange delivery status

## Implemented

- Standalone desktop UI with search, profile/window/group filters, duplicate/empty-tab views, selection, context menus, row and batch close, grouping, and reviewed drag/drop.
- Virtualized rows, scroll anchoring, retained selection/focus during updates, and keyboard navigation.
- Manifest V3 extension and native messaging with a stable extension identity, session-scoped tab references, reconnect, profile renaming, and bounded commands.
- In-app bridge registration, extension folder copying/reveal, repair and removal. Packaged native host uses the app executable, with no external Node requirement.
- Conservative cleanup preview, explicit duplicate survivors, protected grouped tabs, keep-domain rules, configurable protections, and final-window-tab preservation.
- Incremental recovery journal, uncertain-outcome handling, reopening, idempotent restore, retention, and deletion UI.
- macOS DMG/ZIP and Windows per-user NSIS configurations; app icon; no paid Apple account/notarization requirement.
- Unit, UI, large-list, bridge, real-Chrome, and packaged-host tests. CI matrix for macOS ARM64/Intel and Windows.

- Dark/light/system appearance, cluster selection, independent confirmation preferences, friendly window labels, full-window actions and recovery.
- GitVersion 5.12 Mainline with version stamping, multi-platform release artifacts, extension ZIP, checksums, and retryable draft publication; see docs/releasing.md.
- Shared Codex/Claude handoff: AGENTS.md, CLAUDE.md, architecture and behavior specifications.

## Framework decision

Current implementation: Electron. It provides consistent rendering and a JavaScript desktop/host layer. The real browser integration and GUI are tested together.

Tauri could reduce download size by using WKWebView on macOS and WebView2 on Windows. It requires a Rust desktop/host implementation and cross-webview validation. Most interface code, the cleanup model, and Chrome extension can be retained. Runtime memory must be measured on both implementations before claiming a quantified saving. Do not migrate simply because one framework is fashionable; decide based on footprint requirements and maintenance cost.

The absence of an Apple developer subscription applies equally to both frameworks. It affects notarization/distribution friction, not the desired UI features.

## Remaining release gates

- Execute the CI matrix on Windows and Intel macOS; local ARM64 tests do not establish those results.
- Verify downloaded/quarantined macOS first launch, Windows installer/uninstaller, and managed-browser restrictions on actual machines.
- Personal repository `nmehlei/TabArrange` is published under GPL-3.0-only. Hosted CI is running; resolve remaining platform failures before the first automatic release.
- Choose Chrome extension distribution: unpacked installation is working; Web Store publication would improve onboarding and needs separate registration/review.
- Accessibility testing with screen readers and additional high-volume recovery/large-URL fixtures.

## Optional later features

Saved searches/workspaces, archive-and-close, configurable tracking-parameter normalization, suggested grouping rules, session/group reconstruction during recovery, and an optional CLI.
