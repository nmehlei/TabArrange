# Using TabArrange

## Start using it

### Packaged app

On macOS, open the DMG and drag TabArrange into Applications. On Windows, run the per-user installer. Packaged builds contain their own runtime and native messaging host; Node.js is not required.

1. Launch TabArrange and choose **⋯ → Connect Chrome** at the top of the sidebar.
2. Click **Enable bridge**. This registers the local host and copies the companion extension to `~/.chr-organizer/extension`.
3. Open `chrome://extensions` in Chrome, enable **Developer mode**, and click **Load unpacked**.
4. Use **Show extension folder** or **Copy folder path** in the app to select the copied extension directory.
5. Click the extension's toolbar icon, or wait up to 30 seconds. Your tabs appear in the app.
6. Repeat the extension installation for other Chrome profiles. Give connected profiles names in the app's connection dialog.

The extension has a stable ID (`lchoojgeiconnnhmekjagpojoneldeie`), so no IDs need to be copied into a terminal. The extension is not yet published in the Chrome Web Store. Managed browsers may disallow unpacked extensions or native messaging.

If you move the app or install a new build, click **Repair bridge**, then reload the extension at `chrome://extensions`. The bridge should refer to the app in its permanent location, not an app running directly from the mounted DMG.

**macOS distribution:** builds use ad-hoc signing without a paid Apple account or notarization. Downloaded builds can require **System Settings → Privacy & Security → Open Anyway**. Local build testing does not prove the downloaded/quarantined first-launch path. See [Apple's opening guidance](https://support.apple.com/en-gb/102445). Windows builds are unsigned and may show a reputation warning.

### From source

Requires Node.js 22+ and npm:

```sh
npm ci
npm start
```

The same in-app setup works from a checkout. Keep the checkout and Electron runtime at their current paths, or repair the bridge after moving them. `npm run bridge:install` is also available for terminal-based setup; `npm run bridge:remove` removes the host registration.

After enabling the bridge, `npm run chrome:setup` opens Chrome’s Extensions page and copies the installed extension folder path to the clipboard on macOS or Windows. Complete Developer mode → Load unpacked in Chrome. `npm run chrome:setup -- --check` verifies the folder without opening Chrome.

**Try demo** uses sample data only. Exiting demo returns to connected Chrome profiles.

## Everyday workflow

- Search titles, URLs, and profile names; Cmd/Ctrl+K focuses search.
- Filter by exact duplicate sets, empty tabs, window, or group.
- Right-click a window to bring it to front or close it. Closing requires confirmation, includes protected tabs, and records URLs in Recovery. Reload the extension after updating to enable these actions.
- **⋯ → Appearance** switches between System, Light, and Dark. The choice is saved locally; System follows OS appearance changes.
- Each duplicate cluster has a checkbox to select/deselect every copy, with partial selection indicated. Individual copies can still be unchecked before closing.
- Tab and window close dialogs have separate **Always ask** preferences. Uncheck when confirming to skip the next prompt; reenable in **Preferences**.
- Duplicates are clustered by exact URL within each profile; searching retains every copy in a matching cluster.
- Clicking a tab row toggles only that tab; other selected tabs remain selected. Window labels use short numbers per profile, retained for the current app/browser session.
- Drag the sidebar divider to resize it; its width is remembered. Preferences, connection setup, recovery, refresh, and demo are in the sidebar **⋯** menu. Search sits at the top right, and compact rows keep more tabs visible.
- After updating the unpacked extension, click **Reload** on TabArrange Bridge at `chrome://extensions` to activate favicon permission, then choose **⋯ → Refresh tabs** if needed. Failed icon requests retry after reconnection.
- Tab favicons come from Chrome’s local favicon cache and load only for visible rows. Group badges/sidebar markers follow Chrome’s group colors; windows use the Chrome icon.
- Select with checkboxes, Shift-click for ranges, or Ctrl/Cmd-click rows. The selection bar explicitly counts selected tabs hidden by the current filter.
- Close with a row's ×, or review a bulk closure. Show an original tab in Chrome with ↗ or double-click.
- Drag selected tabs onto a sidebar window/group and review the destination. **Group…** and **Move to…** provide keyboard-accessible alternatives.
- **Review cleanup** proposes empty tabs and exact duplicate closures, showing which copy survives. Uncheck suggestions to retain them.
- **Recovery** reopens tabs closed through the app in their original profile. Already-reopened records cannot accidentally be replayed by clicking again.
- **Preferences** configures active/pinned/audible protection, always-keep domains (including subdomains), and 7/30/90-day recovery retention.

Rows support arrow-key navigation, Space selection, Enter to show in Chrome, Delete for reviewed closure, Shift+F10 for a context menu, and Ctrl/Cmd+A to select visible results.

## Behavioral guarantees and limits

- Exact duplicate matching preserves query parameters and fragments and never combines profiles. Suggested cleanup preserves grouped tabs and at least one matching URL.
- Active, pinned, and audible tabs are protected by default; loading tabs and the final tab in a window are protected during ordinary tab closure. Explicit whole-window closure follows its separately confirmed rules. These rules are rechecked inside Chrome immediately before closure.
- Tab references include a browser-session identity. A pending operation from before Chrome restarted cannot act on recycled IDs.
- Only normal, non-incognito windows from connected profiles appear. Chrome profiles without the extension are not accessible.
- Moving the final tabs out of a source window leaves a new tab behind. Cross-profile moves are not supported.
- Recovery reopens URLs, not unsaved form data, navigation history, scroll position, or old group membership. Records with uncertain outcomes are identified separately; reopening them can create duplicates.
- Chrome operations are not transactions. Interrupted moves/groups may be partially applied. A write-ahead recovery journal records closures incrementally; interrupted unconfirmed outcomes remain explicitly uncertain.
- Native-message limits bound very large operations. If a selection exceeds Chrome's limit, the app asks you to use a smaller batch.

## Local data and uninstall

`~/.chr-organizer` contains the copied extension, bridge token, preferences, and recovery records. `workspace.json` and `recovery.jsonl` contain URLs/titles and remain local. Records expire according to Preferences; **Recovery → Delete recovery records** clears them immediately. No telemetry or external service is used.

To disconnect, click **Connect Chrome → Disable bridge**, then remove the extension in Chrome. The Windows uninstaller also removes the per-user host registry entry. Removing the app preserves preferences/recovery records; delete `~/.chr-organizer` yourself if you want those removed too.

Chrome host registration:

- macOS: `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/org.chrorganizer.bridge.json`
- Windows: `HKCU\Software\Google\Chrome\NativeMessagingHosts\org.chrorganizer.bridge`
