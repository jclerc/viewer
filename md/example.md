# Notes

A small dump of how this viewer treats Markdown: headings fold, fences stay literal, inline marks color in place.

## Setup

Clone, then open `index.html`. No build.

- Search uses regex unless you turn it off
- Share links keep the current document in the hash

## Nested section

This `##` folds on its own, inside the `# Notes` block.

1. numbered items
2. still just text
- bullets work too

> quotes stay quiet

```js
function hello(name) {
  return `hi ${name}`;
}
```

Unclosed fence below, so the viewer can mark where input stopped:

```
still waiting
