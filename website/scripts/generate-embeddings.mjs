/**
 * Generates vector embeddings for all docs using OpenRouter's text-embedding-3-small.
 * Reads the CLI manifest, batches docs, calls OpenRouter, and writes embeddings.json.
 *
 * Run: OPENROUTER_API_KEY=... node scripts/generate-embeddings.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = path.resolve(
  __dirname,
  '../../packages/cli/src/data/manifest.json',
);
const OUTPUT_PATH = path.resolve(__dirname, '../src/data/embeddings.json');

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
if (!OPENROUTER_API_KEY) {
  console.error(
    'Error: OPENROUTER_API_KEY environment variable is required.\n' +
      'Usage: OPENROUTER_API_KEY=sk-or-... node scripts/generate-embeddings.mjs',
  );
  process.exit(1);
}

const MODEL = 'openai/text-embedding-3-small';
const BATCH_SIZE = 50;
const MAX_CHARS = 25000; // ~6000 tokens, well within 8191 token limit

/**
 * Call OpenRouter embeddings API for a batch of texts.
 */
async function generateEmbeddings(texts) {
  const response = await fetch('https://openrouter.ai/api/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://www.embedpdf.com',
      'X-Title': 'EmbedPDF Docs',
    },
    body: JSON.stringify({
      input: texts,
      model: MODEL,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenRouter API error (${response.status}): ${error}`);
  }

  const data = await response.json();
  // Sort by index to ensure order matches input
  return data.data
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding);
}

/**
 * Prepare the text to embed for a single doc.
 */
function prepareText(doc) {
  let text = `${doc.title}\n${doc.description}\n\n${doc.content}`;
  if (text.length > MAX_CHARS) {
    text = text.slice(0, MAX_CHARS);
  }
  return text;
}

async function main() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    console.error(
      `Error: Manifest not found at ${MANIFEST_PATH}.\n` +
        'Run "pnpm run generate-manifest" in packages/cli first.',
    );
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
  const docs = manifest.docs;

  console.log(`[generate-embeddings] Processing ${docs.length} docs...`);

  const allEmbeddings = [];

  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = docs.slice(i, i + BATCH_SIZE);
    const texts = batch.map(prepareText);

    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(docs.length / BATCH_SIZE);
    console.log(
      `[generate-embeddings] Embedding batch ${batchNum}/${totalBatches} (${batch.length} docs)...`,
    );

    const embeddings = await generateEmbeddings(texts);
    allEmbeddings.push(...embeddings);

    // Small delay between batches
    if (i + BATCH_SIZE < docs.length) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  const output = {
    model: MODEL,
    generatedAt: new Date().toISOString(),
    docs: docs.map((doc, i) => ({
      path: doc.path,
      title: doc.title,
      description: doc.description,
      url: doc.url,
      framework: doc.framework,
      section: doc.section,
      embedding: allEmbeddings[i],
    })),
  };

  const outputDir = path.dirname(OUTPUT_PATH);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output));

  const fileSizeKB = (fs.statSync(OUTPUT_PATH).size / 1024).toFixed(0);
  console.log(
    `[generate-embeddings] Wrote ${docs.length} doc embeddings (${fileSizeKB}KB) to ${path.relative(process.cwd(), OUTPUT_PATH)}`,
  );
}

main().catch((err) => {
  console.error('[generate-embeddings] Fatal error:', err);
  process.exit(1);
});
