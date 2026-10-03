---
title: Viewer notes
tags: [markdown, gfm, glfm]
---

# Notes

A small dump of how this viewer treats Markdown: it follows **CommonMark**, plus the _GitHub_ and _GitLab_ flavours. Headings fold, and the gutter shows the source line of each block.

[[_TOC_]]

## Text

Inline marks: **bold**, *italic*, ***both***, ~~struck~~, `code`, <kbd>⌘</kbd> + <kbd>K</kbd>, H<sub>2</sub>O and x<sup>2</sup>.
Links: [inline](https://commonmark.org "CommonMark"), [with `code` inside](https://github.github.com/gfm/), [reference][spec], <https://example.com>, and bare www.gitlab.com or hello@example.com.
Escapes \*stay\* literal, entities render: &copy; &rarr; &frac34;. Emoji :rocket: :tada: :+1:.
GitLab extras: {+ added text +}, [- removed text -], colours `#2aa198` `RGB(211, 54, 130)`, and math $`a^2 + b^2 = c^2`$.
A footnote[^why] and another one[^note].
Line ends with two spaces  
so this is a hard break.

[spec]: https://spec.commonmark.org/0.31.2/ "CommonMark spec"
[^why]: Because footnotes are handy.
[^note]: They can hold `code` and **marks** too.

## Lists

- Search uses regex unless you turn it off
- Share links keep the current document in the hash
  - nested items work
  - and keep their level
    1. even ordered ones
    2. numbered from the source

3. Ordered lists keep their start number
4. Next item

- [x] Rewrite the parser
- [ ] Ship it
- [~] Not applicable (GitLab)

## Quotes and alerts

> Quotes get a very light background.
>
> > And they nest.

> [!NOTE]
> Useful information that users should know.

> [!TIP]
> Helpful advice for doing things better.

> [!WARNING]
> Urgent info that needs immediate attention.

> [!CAUTION] Custom title (GitLab)
> Negative potential consequences of an action.

>>>
GitLab multi-line quote: no `>` needed on each line.

It can hold **several** paragraphs.
>>>

## Tables

| Feature | Status | Notes |
| :--- | :---: | ---: |
| Tables | ✓ | aligned **left**, center, right |
| Pipes | ✓ | escape them: `a \| b` |
| [Links](https://github.com) | ✓ | `inline code` too |
| Short row | ✓ |

## Code

```js
// Highlighted by language
export async function hello(name = "world") {
  const greeting = `hi ${name}`;
  return { greeting, length: greeting.length, ok: true };
}
```

```python
@dataclass
class Point:
    x: float = 0.0

    def norm(self) -> float:
        return (self.x ** 2) ** 0.5  # comment
```

```diff
- const total = items.length;
+ const total = items.filter(Boolean).length;
```

```console
$ npm test
ok
```

    indented code blocks work too

## HTML

<details>
<summary>Collapsible section</summary>

Markdown **inside** HTML blocks is rendered, scripts are stripped.

</details>

<p align="center">Raw <em>HTML</em> is sanitized, not dropped.</p>

---

Unclosed fence below, so the viewer can mark where input stopped:

```
still waiting
