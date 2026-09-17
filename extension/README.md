# TabArrange Bridge source

This directory is the complete Manifest V3 extension and is versioned alongside
the desktop app. `manifest.json` belongs at the root when loading it unpacked.
`background.js` inventories and controls tabs/windows/groups through Chrome APIs;
`options.html/js/css` provides profile naming and connection status.

Normally use the desktop app's **Connect Chrome → Enable/Repair bridge**. It copies
this directory into the user's local data folder and registers the native host.
Then load that copied folder at `chrome://extensions` in Developer mode. Reload the
extension after updating files. Repeat installation in every desired Chrome profile.

Never regenerate the manifest public key casually: it fixes the extension ID and
native-host allowed origin. No private signing key is stored here. See
[architecture](../docs/architecture.md), [product spec](../docs/product-spec.md),
and [release workflow](../docs/releasing.md) in the source repository.
