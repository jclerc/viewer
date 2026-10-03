# File Viewer

A small, zero-dependency viewer for notes, dumps, tables, and source.

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

Same chrome as JSON, minus jq and nested-JSON parsing. Rendered like GitHub / GitLab, every heading's section collapses, and the gutter shows each block's source line.

- 📐 [CommonMark 0.31](https://spec.commonmark.org/0.31.2/) (passes the spec examples), plus [GFM](https://github.github.com/gfm/): tables, task lists, strikethrough, autolinks, footnotes, alerts (`> [!NOTE]`)
- 🦊 [GitLab](https://docs.gitlab.com/user/markdown/) extras: `>>>` quotes, `{+ added +}` / `[- removed -]`, colour chips, `[[_TOC_]]`, front matter, `[~]` tasks, image sizes
- 🖍️ Code blocks highlighted for common languages, with a copy button
- 🧼 Raw HTML is sanitized (`<details>`, `<kbd>`, `<sup>`… kept, scripts and handlers dropped)

### CSV

**[CSV →](https://jclerc.github.io/viewer/csv/)**

Same chrome as JSON, minus jq, nested-JSON parsing, and expand / collapse. Click a top-row cell to sort. With **Top row is header** on (default), that row stays put and the rest sort. Turn it off and the first row sorts too.

### Python

**[Python →](https://jclerc.github.io/viewer/py/)**

Same chrome as Markdown. Source is shown in [Black](https://black.readthedocs.io/en/stable/the_black_code_style/current_style.html) style (double quotes, 4-space indent, 88 columns, isort-style imports, wrapped strings). `def` / `class` blocks collapse.

### JavaScript

**[JavaScript →](https://jclerc.github.io/viewer/js/)**

Same chrome as Markdown. Source is shown in [Airbnb](https://github.com/airbnb/javascript) style (single quotes, 2-space indent, semicolons, braces on `if` / `for` / `while`, sorted imports, wrapped strings). JSX is supported. `function` / `class` blocks collapse.

### SQL

**[SQL →](https://jclerc.github.io/viewer/sql/)**

Same chrome as Markdown. Formatted in [Mozilla](https://docs.telemetry.mozilla.org/concepts/sql_style.html) style: uppercase keywords, each clause on its own line with its content indented 2 spaces, one column per line, `AND` / `OR` leading, subqueries and CTEs opened on their own block. Every clause, subquery, `CASE`, and `BEGIN` / `IF` / `LOOP` block collapses.

- 🐘 PostgreSQL, MySQL / MariaDB, SQLite, SQL Server, BigQuery, Snowflake syntax (`::` casts, JSON operators, `$1` / `?` / `:name` / `@var` parameters, backtick and `[bracket]` names)
- 🧱 DDL: `CREATE TABLE` columns one per line, `ALTER TABLE` actions, function, procedure, and trigger headers
- 🔁 Procedural code: PL/pgSQL `$$` bodies, MySQL `DELIMITER`, T-SQL `GO` and `BEGIN … END`
- 📦 Dumps: `pg_dump` `COPY … FROM stdin` data and `mysqldump` multi-row `INSERT`s
- 🧩 dbt / Jinja `{{ … }}` and `{% … %}` kept in place
- 💬 Comments kept where they were written
