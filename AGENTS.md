# TabArrange — instructions for coding agents

Read [README.md](README.md), [docs/architecture.md](docs/architecture.md), and
[docs/product-spec.md](docs/product-spec.md) before changing behavior. For CI,
versioning, installers, or publication, also read [docs/releasing.md](docs/releasing.md).
[PLAN.md](PLAN.md) tracks release gates and future work. Claude sessions should
follow this file too; [CLAUDE.md](CLAUDE.md) points here.

## Ownership and scope

This is the user's personal project, not their employer's repository. Use only
the personal GitHub account explicitly identified by the user. Set commit identity
locally in this repository; never change global Git identity or reuse a company
remote. Never request credentials in chat. The authorized personal account is `nmehlei` and the remote is
`https://github.com/nmehlei/TabArrange.git`. Do not substitute a work account.
The open-source license remains undecided until the user selects it.

## Constraints

- Electron desktop app for macOS and Windows; no paid Apple developer subscription.
  macOS builds are ad-hoc signed, not notarized; Windows builds are unsigned.
- All browser data remains local. No telemetry, cloud backend, remote favicon
  service, content scripts, or CDP attachment needed for the current design.
- Source for the companion extension is in `extension/`, in this same repository.
  Never treat the installed copy in `~/.chr-organizer/extension` as source.
- Preserve the public key in `extension/manifest.json`, `src/extension-id.json`,
  `org.chrorganizer.bridge`, `org.chrorganizer.desktop`, `.chr-organizer`, and the
  legacy Electron user-data path. They intentionally survive the TabArrange rename.
  Changing them requires a deliberate migration, not a search-and-replace.
- Never use real personal Chrome tabs for destructive tests. Integration scripts
  use isolated Chrome for Testing profiles and localhost fixtures.
- Keep sandbox/context isolation enabled, narrow IPC and native host authentication,
  browser-session checks, URL preconditions, and write-ahead recovery records.
- Ordinary tab closure and explicit whole-window closure have different protection
  rules. See the spec; do not silently unify them.
- Keep the virtualized row height in renderer logic and CSS consistent (54px).
- Do not manually increment release versions. GitVersion **5.12.0**, **Mainline**,
  full Git history, and `v` tags are authoritative. Do not upgrade to GitVersion 6
  or copy its incompatible configuration schema.

## Commands and verification

Use Node.js 24 (22+ for ordinary local development). Run `npm ci`, `npm run check`,
and `npm test`. Run `npm run test:ui` for UI changes; `test:performance` for list or
search changes; `test:bridge` and `test:chrome` for browser protocol changes.
Packaged changes require `npm run dist`, `test:packaged-host`, and
`test:chrome:packaged`. See the README for all commands.

Versioning tests use `dotnet tool restore`, then `npm run test:versioning` with
.NET 8 and `DOTNET_ROLL_FORWARD=Major`. They create disposable Git history and do
not initialize or commit this checkout. CI runs them too.

Report exactly which checks ran. A workflow file is not proof of a Windows or
Intel build; only a successful hosted run establishes that. Do not publish source
with browser metadata, local tokens, recovery records, personal fixtures, or secrets.

## Handoff

Update docs when behavior, commands, protocol, or release flow changes. Keep
`PLAN.md` truthful about unverified release gates. Prefer focused changes and tests
for meaningful behavior over tests that merely mirror CSS or implementation text.
