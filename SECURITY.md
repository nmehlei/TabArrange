# Security and privacy

TabArrange handles browsing URLs and titles locally. Treat extension messages, tab titles/URLs, and imported local data as untrusted. The renderer must not receive Node APIs, shell execution, arbitrary filesystem access, or unrestricted IPC.

The native host accepts only the configured extension origin. Its connection to the desktop is authenticated by a per-user token over a Unix socket or Windows named pipe. Do not expose this channel as an unauthenticated network service.

Closure proposals must be revalidated in Chrome, including browser session identity, current URL, protection preferences, and duplicate-survivor existence. Never report reopening as restoration of unsaved page state.

Before public release, establish a private security-reporting channel for the repository. Do not post personal browser URLs, recovery journals, or bridge tokens in public issues.
