# Product behavior specification

## Purpose and platform scope

Organize large existing Chrome workspaces from a native desktop window on macOS
and Windows. Priorities are fast filtering, understandable duplicate cleanup,
minimal overhead, and recoverable actions. No cloud service, telemetry, CDP banner,
or paid Apple developer account. CPU/memory per tab is intentionally absent:
normal stable-Chrome extension APIs do not provide the desired reliable metrics.

## Inventory and navigation

- Include normal, non-incognito windows of connected Chrome profiles only.
- Sidebar: compact app/status/menu header, scrollable collections and window/group
  list to the bottom, scrollbar space separate from counts, resizable saved width.
- Window labels are friendly numbers per profile/session, not Chrome's internal
  numeric IDs; they do not renumber when another window closes during the session.
- Chrome group colors appear in sidebar and rows; dark mode adapts label contrast.
- Appearance offers System, Light, Dark and persists locally. System changes apply
  live; menus, dialogs, empty states, selections, and group labels remain legible.
- Search at top right matches title, URL, and profile; Cmd/Ctrl+K focuses it.

## Selection and duplicates

- Row and checkbox clicks toggle only that row, preserving other selections.
- Shift extends selection; keyboard actions and drag/drop use the same selection.
- Hidden selected tabs are counted explicitly in the selection toolbar.
- Duplicate means identical full URL within a profile (queries/fragments preserved).
- All copies remain adjacent. A search matching one copy retains all copies of that
  cluster, even when titles differ. Copy position/count and cluster boundaries are visible.
- Cluster checkbox selects/deselects all copies and reflects partial selection.
  This is manual selection, not a keep-one cleanup action. Users may uncheck a copy.
- Suggested cleanup is separate: review candidates and retained survivors first.
  It protects grouped tabs and never proposes removal of every copy of a URL.

## Closing tabs versus closing windows

Ordinary tab closure respects active/pinned/audible preferences, always-keep domains,
navigation protection, and the last-tab-in-window guard. Recheck state in Chrome,
not just the desktop snapshot. A row X is a quick close; bulk close uses a dialog
by default. Tab and window dialogs each have their own saved Always ask checkbox;
unchecking when confirming skips that type of prompt next time. Cancelling does
not save the choice. Preferences can reenable either confirmation.

Explicit whole-window closure is a different user action: confirm tab count and
profile, explain that active/pinned/audio tabs are included, and that unsaved work
can be lost. It may close the final tab/window. Verify exact confirmed tab IDs/URLs
and browser session before calling Chrome's window removal. If contents changed,
refuse and request another review. Log all confirmed closures; cancellations/skips
and interrupted outcomes must not be reported as fully successful. Right-click a
window also offers Bring to front, restoring a minimized window first.

## Organizing and recovery

Move/group only within a profile. Review drag destinations before applying. Leave
a new tab in an otherwise emptied source window. Do not promise atomicity for a
multi-tab Chrome action; partial results must be reported.

Recovery reopens URLs in the original connected profile, preferring the original
window when still valid, otherwise another/new window. It cannot restore unsaved
forms, page state, navigation history, or original groups. Already-restored records
must not be replayed automatically. Uncertain outcomes require explicit inclusion.
Retention choices are 7/30/90 days; deletion of the local record history is separate
from closing browser tabs.

## Distribution and non-goals

The repository contains both app and extension. Installers bundle the extension;
releases also attach a loadable extension ZIP. Chrome Web Store distribution is
not implemented. macOS is ad-hoc signed without notarization; Windows is unsigned.
No automatic updater, session archive/sync, fuzzy URL normalization, tab resource
monitoring, or cross-profile moves are currently promised.

Acceptance checks are the Node tests and existing UI, performance, bridge, Chrome,
and packaged-host scripts described in README and AGENTS.md. Hosted builds on all
supported architectures are required before claiming cross-platform verification.
