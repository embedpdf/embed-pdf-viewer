/**
 * Scans website/src/content/docs/ for all MDX files,
 * extracts frontmatter (title, description, searchable) and full text content,
 * and writes src/lib/manifest.json.
 *
 * Run: node scripts/generate-manifest.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = path.resolve(__dirname, '../../../website/src/content/docs');
const TOOLS_DIR = path.resolve(__dirname, '../../../website/src/content/tools');
const OUTPUT_PATH = path.resolve(__dirname, '../src/data/manifest.json');

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return { fm: {}, body: content };

  const fm = {};
  for (const line of match[1].split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let value = line.slice(colonIdx + 1).trim();

    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    // Parse booleans
    if (value === 'true') value = true;
    else if (value === 'false') value = false;

    fm[key] = value;
  }

  // Everything after the frontmatter block
  const body = content.slice(match[0].length);
  return { fm, body };
}

/**
 * Strip MDX/JSX syntax from doc content, returning plain searchable text.
 */
function stripMdx(content) {
  let text = content;

  // Remove import statements
  text = text.replace(/^import\s+.*?;\s*$/gm, '');

  // Remove JSX component wrappers but keep text children
  // e.g. <ExampleWrapper>...</ExampleWrapper>
  text = text.replace(/<ExampleWrapper[^>]*>[\s\S]*?<\/ExampleWrapper>/g, '');

  // Remove Callout tags but keep content
  text = text.replace(/<\/?Callout[^>]*>/g, '');

  // Remove self-closing JSX tags
  text = text.replace(/<[A-Z][a-zA-Z]*\s*[^>]*\/>/g, '');

  // Remove remaining JSX open/close tags (keep text content)
  text = text.replace(/<\/?[A-Z][a-zA-Z]*[^>]*>/g, '');

  // Remove fenced code blocks (they're code examples, not prose)
  text = text.replace(/```[\s\S]*?```/g, '');

  // Remove inline code backticks but keep the text
  text = text.replace(/`([^`]+)`/g, '$1');

  // Remove markdown link syntax, keep text
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  // Remove markdown image syntax
  text = text.replace(/!\[([^\]]*)\]\([^)]+\)/g, '');

  // Remove HTML comments
  text = text.replace(/<!--[\s\S]*?-->/g, '');

  // Remove markdown heading markers but keep text
  text = text.replace(/^#{1,6}\s+/gm, '');

  // Remove markdown bold/italic markers
  text = text.replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1');
  text = text.replace(/_{1,3}([^_]+)_{1,3}/g, '$1');

  // Remove horizontal rules
  text = text.replace(/^[-*_]{3,}\s*$/gm, '');

  // Remove markdown list markers
  text = text.replace(/^\s*[-*+]\s+/gm, '');
  text = text.replace(/^\s*\d+\.\s+/gm, '');

  // Collapse multiple blank lines
  text = text.replace(/\n{3,}/g, '\n\n');

  return text.trim();
}

function inferMeta(relativePath, collection = 'docs') {
  const parts = relativePath.replace(/\.mdx$/, '').split('/');

  let framework = null;
  let section = null;

  if (collection === 'tools') {
    section = 'tools';
  } else if (['react', 'vue', 'svelte'].includes(parts[0])) {
    framework = parts[0];
    if (['headless', 'viewer'].includes(parts[1])) {
      section = parts[1];
    }
  } else if (parts[0] === 'snippet') {
    section = 'snippet';
  } else if (parts[0] === 'engines') {
    section = 'engines';
  } else if (parts[0] === 'pdfium') {
    section = 'pdfium';
  }

  const docPath = relativePath.replace(/\.mdx$/, '');
  const urlPrefix = collection === 'tools' ? 'tools' : 'docs';
  const url = `https://www.embedpdf.com/${urlPrefix}/${docPath}`;

  return { docPath, url, framework, section };
}

function scanCollection(dir, collection) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { recursive: true });
  const docs = [];

  for (const entry of entries) {
    const entryStr = String(entry);
    if (!entryStr.endsWith('.mdx')) continue;

    const fullPath = path.join(dir, entryStr);
    const raw = fs.readFileSync(fullPath, 'utf-8');
    const { fm, body } = parseFrontmatter(raw);

    // Skip non-searchable pages
    if (fm.searchable === false) continue;

    // Skip index pages (they're usually just navigation wrappers)
    const basename = path.basename(entryStr, '.mdx');
    if (basename === 'index') continue;

    const meta = inferMeta(entryStr, collection);
    const content = stripMdx(body);

    docs.push({
      path: meta.docPath,
      title: fm.title || basename,
      description: fm.description || '',
      url: meta.url,
      framework: meta.framework,
      section: meta.section,
      content,
    });
  }

  return docs;
}

function scanDocs() {
  const docs = [
    ...scanCollection(CONTENT_DIR, 'docs'),
    ...scanCollection(TOOLS_DIR, 'tools'),
  ];

  // Sort by path for deterministic output
  docs.sort((a, b) => a.path.localeCompare(b.path));
  return docs;
}

const docs = scanDocs();

fs.writeFileSync(OUTPUT_PATH, JSON.stringify({ docs }, null, 2) + '\n');

const totalContentChars = docs.reduce((sum, d) => sum + d.content.length, 0);
console.log(
  `[generate-manifest] Wrote ${docs.length} docs (${(totalContentChars / 1024).toFixed(0)}KB of content) to ${path.relative(process.cwd(), OUTPUT_PATH)}`,
);
