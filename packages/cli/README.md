<div align="center">
  <a href="https://www.embedpdf.com">
    <img alt="EmbedPDF logo" src="https://www.embedpdf.com/logo-192.png" height="96">
  </a>
  <h1>EmbedPDF</h1>

<a href="https://www.npmjs.com/package/@embedpdf/cli"><img alt="NPM version" src="https://img.shields.io/npm/v/@embedpdf/cli.svg?style=for-the-badge&labelColor=000000"></a> <a href="https://github.com/embedpdf/embed-pdf-viewer/blob/main/packages/cli/LICENSE"><img alt="License" src="https://img.shields.io/npm/l/@embedpdf/cli.svg?style=for-the-badge&labelColor=000000"></a> <a href="https://github.com/embedpdf/embed-pdf-viewer/discussions"><img alt="Join the community on GitHub" src="https://img.shields.io/badge/Join%20the%20community-blueviolet.svg?style=for-the-badge&labelColor=000000"></a>

</div>

# @embedpdf/cli

CLI for searching and reading EmbedPDF documentation directly from your terminal.

## Documentation

For complete guides, examples, and full API reference, visit:

**[Official Documentation](https://www.embedpdf.com/docs)**

## Installation

```bash
# npm
npm install -g @embedpdf/cli

# pnpm
pnpm add -g @embedpdf/cli

# or run directly
npx @embedpdf/cli
```

## Commands

### `embedpdf search-docs <query>`

Full-text search over the entire documentation corpus.

```bash
# Basic search
embedpdf search-docs "zoom"

# Filter by framework
embedpdf search-docs "getting started" --framework react

# Filter by section
embedpdf search-docs "annotations" --section headless

# JSON output (for LLM consumption)
embedpdf search-docs "rendering" --json --limit 5
```

| Option | Description |
|---|---|
| `--json` | Output as JSON |
| `--framework <framework>` | Filter by framework (`react`, `vue`, `svelte`) |
| `--section <section>` | Filter by section (`headless`, `viewer`, `snippet`, `engines`, `pdfium`) |
| `--limit <n>` | Maximum number of results (default: `10`) |

### `embedpdf doc [path]`

Fetch and display a documentation page.

```bash
# Fetch a specific doc
embedpdf doc react/headless/getting-started

# List all available pages
embedpdf doc --list

# List docs for a specific framework
embedpdf doc --list --framework vue

# Output as JSON
embedpdf doc react/headless/plugins/plugin-zoom --json
```

| Option | Description |
|---|---|
| `--json` | Output as JSON |
| `--list` | List all available doc pages |
| `--framework <framework>` | Filter by framework (`react`, `vue`, `svelte`) |
| `--section <section>` | Filter by section (`headless`, `viewer`, `snippet`, `engines`, `pdfium`) |

## Programmatic Usage

The package also exports functions for use in Node.js:

```typescript
import { searchDocs, fetchDocContent, getManifest } from '@embedpdf/cli';

// Search docs
const results = searchDocs('zoom', { framework: 'react', limit: 5 });

// Fetch a doc page
const content = await fetchDocContent('react/headless/getting-started');

// Get the full manifest
const manifest = getManifest();
```

## License

MIT – see the [LICENSE](https://github.com/embedpdf/embed-pdf-viewer/blob/main/packages/cli/LICENSE) file.
