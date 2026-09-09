# File Viewer

A small, zero-dependency viewer for notes, dumps, and tables.

**[Open it →](https://jclerc.github.io/viewer/)**

Paste or upload on the landing page. It stores the document locally, then opens the matching viewer.

### JSON

**[JSON →](https://jclerc.github.io/viewer/json/)**

- 🎨 Syntax colors, expand / collapse, Light / Default / Dark
- 🧩 Nested JSON strings parsed in place (can be turned off)
- 🩹 Incomplete JSON still renders, with a mark where it stopped
- 🔍 Search in the tree (regex on by default)
- 🧪 Apply common jq filters (kept in the share link)
- ⛶ Fullscreen the viewer
- 🔗 Share a link (document + line selection live in the URL hash)
- 💾 Paste, upload, or pick up where you left off (saved locally)

### Markdown

**[Markdown →](https://jclerc.github.io/viewer/md/)**

Same chrome as JSON, minus jq and nested-JSON parsing. `#` and `##` sections collapse.

### CSV

**[CSV →](https://jclerc.github.io/viewer/csv/)**

Same chrome as JSON, minus jq, nested-JSON parsing, and expand / collapse. Click a top-row cell to sort. With **Top row is header** on (default), that row stays put and the rest sort. Turn it off and the first row sorts too.
