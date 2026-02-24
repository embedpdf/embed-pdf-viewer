<div align="center">
  <a href="https://www.embedpdf.com">
    <img alt="EmbedPDF logo" src="https://www.embedpdf.com/logo-192.png" height="96">
  </a>

  <h1>EmbedPDF Snippet</h1>
  <p>The easiest way to embed PDF files in your website with a complete, ready‑to‑use interface.</p>

<a href="https://www.embedpdf.com/docs/snippet/introduction"><img alt="Documentation" src="https://img.shields.io/badge/View%20Docs-0af?style=for-the-badge&labelColor=000000"></a>
<a href="https://snippet.embedpdf.com/"><img alt="Live Demo" src="https://img.shields.io/badge/Try%20Live%20Demo-ff1493.svg?style=for-the-badge&labelColor=000000"></a>

</div>

---

## 📚 Documentation

The full walkthrough, advanced examples, and API reference live in our docs site:

👉 **[https://www.embedpdf.com/docs/snippet/introduction](https://www.embedpdf.com/docs/snippet/introduction)**

---

## 🚀 Introduction

**EmbedPDF Snippet** is a _“batteries‑included”_ drop‑in that turns any `<div>` into a professional PDF reader. No build step, no framework lock‑in—just copy, paste, and you’re done.

### Why choose the Snippet?

- **Complete UI out‑of‑the‑box** – toolbar, thumbnails, search, zoom & more
- **Zero build tooling** – works in plain HTML pages or alongside any JS framework
- **30‑second setup** – a single `<script type="module">` is all you need
- **Fully configurable** – tweak behavior with a lightweight options object
- **Runs everywhere** – modern browsers, frameworks, static sites & CMSes

---

## ⚡️ Quick Install

Add the CDN module and point it at a container:

```html filename="index.html" copy
<div id="pdf-viewer" style="height: 500px"></div>
<script async type="module">
  import EmbedPDF from 'https://cdn.jsdelivr.net/npm/@embedpdf/snippet@2/dist/embedpdf.js';

  const viewer = EmbedPDF.init({
    type: 'container', // mount strategy
    target: document.getElementById('pdf-viewer'),
    src: 'https://snippet.embedpdf.com/ebook.pdf', // your PDF URL
  });
</script>
```

That’s it—refresh and enjoy a full‑featured viewer.

---

## 🛠 Basic Usage Pattern

1. **Container** – create a DOM element where the viewer will render.
2. **Import** – load `embedpdf.js` from the CDN with `type="module"`.
3. **Initialize** – call `EmbedPDF.init()` with your configuration.

### Minimal Example

```html filename="basic-example.html" copy
<!DOCTYPE html>
<html>
  <head>
    <title>My PDF Viewer</title>
  </head>
  <body>
    <div id="pdf-viewer" style="height: 100vh"></div>
    <script async type="module">
      import EmbedPDF from 'https://cdn.jsdelivr.net/npm/@embedpdf/snippet@2/dist/embedpdf.js';

      const viewer = EmbedPDF.init({
        type: 'container',
        target: document.getElementById('pdf-viewer'),
        src: 'https://snippet.embedpdf.com/ebook.pdf',
      });
    </script>
  </body>
</html>
```

## 📄 License

EmbedPDF Snippet is [MIT licensed](https://github.com/embedpdf/embed-pdf-viewer/blob/main/LICENSE). Commercial use is welcome—just keep the copyright headers intact.
