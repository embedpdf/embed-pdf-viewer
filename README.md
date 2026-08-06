<div align="center">
  <a href="https://www.embedpdf.com">
    <img alt="EmbedPDF logo" src="https://www.embedpdf.com/logo-192.png" height="96">
  </a>

  <h1>EmbedPDF</h1>

  <!-- Badges -->

<a href="https://github.com/embedpdf/embed-pdf-viewer/blob/main/LICENSE"><img alt="License: Apache 2.0" src="https://img.shields.io/badge/license-Apache%202.0-blue.svg?style=for-the-badge&labelColor=000000"></a>
<a href="https://snippet.embedpdf.com/"><img alt="Live demo" src="https://img.shields.io/badge/Try%20the%20Live%20Demo-ff1493.svg?style=for-the-badge&labelColor=000000"></a>
<a href="https://discord.gg/mHHABmmuVU"><img alt="Join our Discord" src="https://img.shields.io/discord/1351694551047475313?logo=discord&style=for-the-badge&labelColor=000000"></a>

</div>

> [!WARNING]
> **EmbedPDF v3 is under active development and is not yet recommended for production use.** For the current stable release, use the [`v2` branch](https://github.com/embedpdf/embed-pdf-viewer/tree/v2).

# Open‑Source JavaScript PDF Viewer

**EmbedPDF** is a framework‑agnostic, Apache‑2.0‑licensed PDF viewer that drops into _any_ JavaScript project. Whether you build with **React, Vue, Svelte, Preact,** or vanilla JS, EmbedPDF delivers a smooth, modern reading experience and a clean developer API.

---

## 📚 Documentation

Full docs, installation guides, API reference, and examples:

👉 **[https://www.embedpdf.com](https://www.embedpdf.com)**

## 🚀 Live Demo

Try it now — load your own PDF or use the sample:

👉 **[https://app.embedpdf.com](https://app.embedpdf.com)**

---

## 💖 Sponsors

We are grateful for the support of our sponsors!

### Silver Sponsors

<div align="left">
  <a href="https://www.withloveinternet.com?utm_source=embedpdf&utm_campaign=oss" target="_blank"><img src=".github/assets/sponsor-wli.png" alt="With Love Internet" height="80"></a>
  &nbsp;&nbsp;<a href="https://align.lawyer?utm_source=embedpdf&utm_campaign=oss" target="_blank"><img src=".github/assets/sponsor-align.jpeg" alt="Align" height="80"></a>
</div>

### Bronze Sponsors

<div align="left">
  <a href="https://www.accrual.com?utm_source=embedpdf&utm_campaign=oss" target="_blank"><img src=".github/assets/sponsor-accrual.jpg" alt="Accrual" height="64"></a>
  &nbsp;&nbsp;<a href="https://layer.team/?utm_source=embedpdf&utm_campaign=oss" target="_blank"><img src=".github/assets/sponsor-layer.png" alt="Layer" height="64"></a>
  &nbsp;&nbsp;<a href="https://www.lefebvre-group.com?utm_source=embedpdf&utm_campaign=oss" target="_blank"><img src=".github/assets/sponsor-lefebvre.png" alt="Lefebvre" height="64"></a>
  &nbsp;&nbsp;<a href="https://forml.eu?utm_source=embedpdf&utm_campaign=oss" target="_blank"><img src=".github/assets/sponsor-forml.png" alt="forml" height="64"></a>
</div>

---

## ✨ Features

- Annotations (highlight, sticky notes, free text, ink)
- True redaction (content is actually removed)
- Search, text selection, zoom, rotation
- Smooth, virtualized scrolling
- Pluggable architecture & tree-shakable plugins

## 🤝 Contributing

We love contributions! To get started, read our [contributing guide](CONTRIBUTING.md) and jump into the [GitHub discussions](https://github.com/embedpdf/embed-pdf-viewer/discussions).

## 📄 License

Everything in this repository is licensed under the [Apache License, Version 2.0](LICENSE), with one exception: [`cloudpdf/server`](cloudpdf/server) — the self-hostable CloudPDF server — is **Fair Source**, under the [Fair Core License, FCL-1.0-ALv2](cloudpdf/server/LICENSE). Its source may be inspected, copied, and modified for purposes permitted by the FCL. **That does not make the server free to run:** while a release remains under the FCL, running or self-hosting it requires a valid CloudPDF license (a license key for a connected deployment or a signed certificate for an air-gapped deployment). You may not move, change, disable, or circumvent the license-key functionality; enable protected functionality without a valid license; or remove protected functionality. Competing Uses, as defined in the FCL, are also prohibited. Each release automatically becomes Apache-2.0 two years after publication. See [LICENSING.md](LICENSING.md) for the full licensing map, including website content.

## Third-Party Licenses

The engine is powered by [EmbedPDF Runtime](https://github.com/embedpdf/runtime), our fork of [PDFium](https://pdfium.googlesource.com/pdfium/), which is licensed under the [Apache License, Version 2.0](https://pdfium.googlesource.com/pdfium/+/refs/heads/main/LICENSE). PDFium is a Google project; EmbedPDF is not affiliated with or endorsed by Google.
