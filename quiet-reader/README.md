# Quiet Chapter Reader

Standalone reader route: `/quiet-reader/`. It is separate from the Son Hai De Dang novel library and does not add chapters to `data/chapters.json`.

The page uses the public Cloudflare reader API at `https://quiet-chapter-reader.tda-group-4190.chatgpt.site`. It requests only Com Nguoi Novel chapter URLs, displays text returned by the source, and respects the source access checks. It does not store chapter text. Text pasted into the page stays in that browser tab.
