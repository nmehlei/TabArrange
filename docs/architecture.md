# Architecture and maintenance map

TabArrange is an Electron desktop application with a Manifest V3 Chrome extension.
It controls existing, ordinary Chrome sessions without remote debugging or a web UI.
The extension is the browser authority; the desktop provides the workspace and
local recovery. There is one extension identity installed in each connected profile.

## Repository map

| Location | Responsibility |
| --- | --- |
| `src/bootstrap.cjs` | Select desktop vs native-host mode based on Chrome's caller origin |
| `src/main.cjs` | Electron lifecycle, scoped IPC, local socket server, profile inventory, command locks |
| `src/preload.cjs` | Only permitted renderer-to-main methods; no Node exposure |
| `src/native-host.cjs` | Native messaging stdio transport to the desktop socket |
| `src/protocol.cjs` | Fragmentation-safe length-prefixed JSON framing; 8 MiB local bound |
| `src/shared.cjs` | Data location and per-user socket/named-pipe names |
| `src/installation.cjs` | Host registration, extension copying, repair/removal |
| `src/validation.cjs` | Snapshot and action validation before IPC crosses into Chrome |
| `src/store.cjs` | Preferences, recovery snapshot and incremental journal |
| `src/model.mjs` | Flattening, filters, exact duplicates, protections, suggested cleanup, demo fixtures |
| `src/renderer.mjs` | Virtual list, sidebar, selection, dialogs, context menus, favicon cache |
| `src/theme.js` | Early theme application and local System/Light/Dark preference |
| `src/index.html`, `src/style.css` | Static desktop UI and light/dark styling |
| `extension/` | Complete loadable Chrome extension source, including options UI and manifest |
| `scripts/` | Setup helpers, smoke/integration checks, versioning and release automation |
| `tests/` | Node unit/regression tests, including destructive-action safeguards and release logic |
| `build/` | Original app icon source/PNG and Windows uninstall hook |

## Runtime path

1. Renderer calls `window.chromeBridge`, exposed by the isolated preload.
2. Main validates the sender frame, selected profile, session, and action inputs.
3. Main sends the command over an authenticated Unix socket (macOS) or named pipe
   (Windows), not a TCP port.
4. Chrome's native-host process forwards framed JSON over stdio to the extension.
5. The extension checks live Chrome state again, performs the action, emits progress
   for destructive operations, and publishes the resulting inventory.

On macOS, the packaged executable doubles as the native host. Its origin argument must match
`chrome-extension://lchoojgeiconnnhmekjagpojoneldeie/`. Development installations
use a wrapper pointing at the installed local runtime; packaged installations do
not require Node.js. Windows packaged installations use a generated `.cmd` launcher
with `ELECTRON_RUN_AS_NODE=1`, running the packaged executable against the bundled
`resources/app.asar.unpacked/src/native-host.cjs` files. This avoids Electron GUI-mode stdout
limitations on Windows. Use `asarUnpack` for these shared files; copying them
via `extraResources` would exclude them from the desktop archive. Chrome’s manifest still restricts the extension origin and
the host authenticates to the local named pipe. Moving an app requires Repair
bridge to update its host path.

## Messages and identity

`authenticate` carries the per-user secret read from the local token file. It must
precede socket traffic. `snapshot` includes `profile: {id, name}`, `sessionId`,
`windows`, `groups`, `tabs`, and optional supported `capabilities`. Chrome profile
UUID is stored in `chrome.storage.local`; browser-session UUID is stored in
`chrome.storage.session`. Chrome may reuse numeric tab/window IDs after restart,
so IDs alone never authorize a mutation.

Commands have an opaque correlation `id`, an `action.type`, `sessionId`, and the
relevant tab references `{id, url}` or destination window/group. `progress` and
`result` messages correlate by ID; results carry counts, confirmed closed/restored
records, skips, or an error. Main serializes mutations per profile. Extension
commands are also serialized. Snapshot events are debounced and reconnection is
retried with a Chrome alarm. `refresh` and profile `rename` do not require selected
tabs. Tab and restore batches are bounded; favicon batches contain at most 32 tabs.

Actions: `focus`, `close`, `group`, `move`, `refresh`, `rename`, `favicons`,
`focus-window`, `close-window`; main alone issues `restore` from saved recovery.
The `window-actions` capability prevents newer desktop commands being sent to an
older extension. Changes to other protocol features should use similar capability
checks if compatibility requires them.

## Recovery and storage

`~/.chr-organizer/workspace.json` stores preferences and closure batches.
`recovery.jsonl` journals individual outcomes with a sequence watermark. Records
are written before a closure request, progress is applied incrementally, and an
interrupted pending outcome becomes `uncertain`. Replay ignores events already
included in the snapshot. Never mark an unacknowledged action as definitely closed.
Restoring records updates their status so retries do not blindly duplicate tabs.

The same data directory contains the native-host token and copied extension.
`CHR_ORGANIZER_DATA_DIR` is used by isolated tests. Electron's historical
`chr-organizer` user-data folder is retained for UI localStorage (theme and sidebar
width). No account sync exists. Runtime files are not repository content.

## UI and icons

The list renders visible rows plus overscan; row height is 54px. Preserve focus,
selection, and scroll anchors during asynchronous snapshots. Duplicate clusters
use exact URL plus profile identity; search retains an entire matching cluster.
Cluster controls are part of the first row and must use the same selection set as
individual controls, including indeterminate state.

Favicons are requested only for visible/overscan rows through Chrome's local
`/_favicon/` endpoint. The extension returns bounded PNG data; the renderer accepts
validated data URLs under its existing CSP. Cache size is capped at 512 entries.
Failures back off, show reload guidance where appropriate, and retry on reconnect.
Do not replace this with website requests for all open tabs.

## Test isolation

`test:chrome` launches Chrome for Testing with temporary profiles and synthetic
localhost content. `test:chrome:packaged` uses the packaged executable and bundled
extension. Windows tests register a uniquely named temporary native host and remove
it afterward. `test:ui` uses sample data; `test:performance` uses 5,000 synthetic tabs.
`test:versioning` creates temporary Git histories. No test should attach to the
user's everyday browser profile or derive fixtures from browsing history.
