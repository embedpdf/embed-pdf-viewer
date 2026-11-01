/**
 * Builds the docs' demo PDFs. Chrome prints each document's HTML, with its text, pictures and
 * links; the engine then adds what Chrome can't make: form fields, viewer commands, the outline
 * and the metadata. Run `pnpm --filter @embedpdf/docs-content pdfs`, or name documents to build
 * only those (`… pdfs forms`).
 *
 * A document is a folder: `document.html`, US Letter pages styled by `shared/document.css`, and
 * `bake.mjs`, which changes the printed document in `edit()` steps, each as one person, and places
 * what it adds on the boxes the HTML marks with `data-pdf`. Each PDF lands in both sites'
 * `public/pdfs/<folder>.pdf`, embedpdf.com's and cloudpdf.com's: a made-up company's document the
 * same on both, the welcome as each site's own brand. Chrome is the installed Google Chrome;
 * `CHROME_PATH` names another.
 */
import { readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inflateSync } from 'node:zlib';

import { localEngine } from '@embedpdf/engine';
import { chromium } from 'playwright-core';

const here = dirname(fileURLToPath(import.meta.url));
// Where each site serves the PDFs, by the brand it's for.
const SITES = {
  embedpdf: resolve(here, '../../../website/public/pdfs'),
  cloudpdf: resolve(here, '../../../cloudpdf/website/public/pdfs'),
};
const chrome =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// CSS lays the pages out in px (96 per inch); PDF positions are points (72 per inch).
const POINTS_PER_PX = 72 / 96;

// Our products' names. A document says only its own company's, so a made-up company's never says
// either: a reader can't take its invoice or notice for one of ours.
const PRODUCTS = ['embedpdf', 'cloudpdf'];

// The fonts `shared/document.css` loads. Any other font in a printed page is a fallback: a
// character the fonts don't have, which should be drawn as SVG instead.
const OWN_FONTS = /^[A-Z]{6}\+(Inter|Manrope|JetBrainsMono)/;

const requested = process.argv.slice(2);
const documents = (await readdir(here, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && existsSync(join(here, entry.name, 'bake.mjs')))
  .map((entry) => entry.name)
  .filter((name) => requested.length === 0 || requested.includes(name));
for (const name of requested) {
  if (!documents.includes(name)) throw new Error(`No document '${name}' in ${here}`);
}

const browser = await chromium.launch({ executablePath: chrome });
// WebAssembly, the runtime browsers use: the same PDF from every machine.
const engine = localEngine({ runtime: { prefer: 'wasm' } });
try {
  for (const name of documents) {
    const bakeModule = await import(pathToFileURL(join(here, name, 'bake.mjs')).href);
    // Ours (the welcome): a version per brand, each for its own site. A made-up company's: one,
    // the same on every site.
    const versions = bakeModule.brands
      ? bakeModule.brands.map((company) => ({
          company,
          brand: company.userId,
          sites: [company.userId],
        }))
      : [{ company: bakeModule.company, brand: null, sites: Object.keys(SITES) }];
    for (const { company, brand, sites } of versions) {
      if (!company)
        throw new Error(`${name}: bake.mjs exports no company (shared/annotations.mjs)`);
      const { pdf, marks } = await print(join(here, name, 'document.html'), brand);
      const { bytes, published } = await bake(name, bakeModule, company, pdf, marks);
      await checkNames(name, bytes, company);
      for (const site of sites) {
        await writeFile(join(SITES[site], `${name}.pdf`), bytes);
        for (const [extension, data] of published) {
          await writeFile(join(SITES[site], `${name}${extension}`), data);
        }
      }
      const as = brand ? ` as ${company.displayName}` : '';
      console.log(
        `${name}${as}: ${marks.length} marked boxes, ${bytes.length} bytes` +
          `${published.map(([extension]) => ` and ${name}${extension}`).join('')} → ${sites.join(', ')}`,
      );
    }
  }
} finally {
  await browser.close();
  await engine.destroy();
}

/**
 * Prints one document with Chrome, as `brand` when it's one of ours (`shared/brand.js` reads it),
 * and measures the boxes it marks with `data-pdf`.
 */
async function print(htmlFile, brand) {
  const page = await browser.newPage();
  try {
    const url = pathToFileURL(htmlFile);
    if (brand) url.searchParams.set('brand', brand);
    await page.goto(url.href, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    const marks = await page.evaluate((scale) => {
      const sheets = [...document.querySelectorAll('.page')];
      return [...document.querySelectorAll('[data-pdf]')].map((element) => {
        const sheet = element.closest('.page');
        const origin = sheet.getBoundingClientRect();
        const points = (value) => Math.round(value * scale * 100) / 100;
        const onPage = (box) => ({
          x: points(box.left - origin.left),
          y: points(box.top - origin.top),
          width: points(box.width),
          height: points(box.height),
        });
        return {
          name: element.dataset.pdf,
          value: element.dataset.pdfValue ?? null,
          pageIndex: sheets.indexOf(sheet),
          rect: onPage(element.getBoundingClientRect()),
        };
      });
    }, POINTS_PER_PX);
    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true, tagged: true });
    checkFonts(htmlFile, pdf);
    return { pdf, marks };
  } finally {
    await page.close();
  }
}

/**
 * Runs the document's `bake.mjs` on the printed PDF, and saves the result whole. Each `edit()`
 * step opens the PDF as one person, so what it adds carries their name, and saves it before the
 * next step opens it. The saves add to the file, so refs stay valid from step to step.
 *
 * A bake may also export `sign()`: one more step, on the file as saved whole, whose save is added
 * to it, so a signature made there seals the finished document. Its `publish(extension, bytes)`
 * puts a file next to the PDF, such as the certificate a signature can be checked against.
 */
async function bake(name, bakeModule, company, pdf, marks) {
  let bytes = new Uint8Array(pdf);
  const used = new Set();
  const published = [];

  const step = async (identity, work) => {
    const doc = await engine.open({ kind: 'bytes', bytes }, { identity });
    try {
      const { pages } = await doc.pages.list();
      // Every box of a name, each with its page and its rect, and a radio button's value.
      const places = (markName) => {
        const found = marks.filter((mark) => mark.name === markName);
        if (found.length === 0) throw new Error(`${name}: no box marked data-pdf="${markName}"`);
        used.add(markName);
        return found.map((mark) => ({
          page: pages[mark.pageIndex].ref,
          rect: mark.rect,
          ...(mark.value === null ? {} : { value: mark.value }),
        }));
      };
      const place = (markName) => {
        const [only, ...more] = places(markName);
        if (more.length > 0) throw new Error(`${name}: more than one box marked "${markName}"`);
        return only;
      };
      const publish = (extension, data) => published.push([extension, data]);
      await work({ engine, doc, pages, place, places, publish });
      bytes = await doc.download();
    } finally {
      await doc.close();
    }
  };
  const edit = (...args) => step(...(args.length === 1 ? [company, args[0]] : args));

  await bakeModule.default({ edit, company });

  const whole = await engine.open({ kind: 'bytes', bytes });
  try {
    bytes = await whole.download({ mode: 'rewrite' });
  } finally {
    await whole.close();
  }
  if (bakeModule.sign) await step(company, bakeModule.sign);

  const unused = [...new Set(marks.map((mark) => mark.name))].filter((mark) => !used.has(mark));
  if (unused.length > 0) throw new Error(`${name}: bake.mjs never uses ${unused.join(', ')}`);
  return { bytes, published };
}

/**
 * Fails when the finished document names a product of ours other than its company's own: in its
 * text, its annotations (link targets and notes among them), its fields, its outline or the
 * metadata a reader sees. The producer, the app that made the file, isn't the document's to say.
 */
async function checkNames(name, bytes, company) {
  const doc = await engine.open({ kind: 'bytes', bytes });
  try {
    const { pages } = await doc.pages.list();
    const texts = [];
    for (const page of pages) texts.push((await doc.page(page.ref).text.get()).text);
    const { annotations } = await doc.annotations.list();
    const { fields } = await doc.forms.list();
    const { items } = await doc.outline.get();
    const { title, author, subject, keywords } = await doc.metadata.get();
    const everything = JSON.stringify([
      texts,
      annotations,
      fields,
      items,
      title,
      author,
      subject,
      keywords,
    ]).toLowerCase();
    const named = PRODUCTS.filter(
      (product) => product !== company.userId && everything.includes(product),
    );
    if (named.length > 0) {
      throw new Error(`${name}: ${company.displayName}'s document names ${named.join(' and ')}`);
    }
  } finally {
    await doc.close();
  }
}

/** Fails when a page drew text in a font of its own instead of one `document.css` loads. */
function checkFonts(htmlFile, pdf) {
  const text = pdf.toString('latin1');
  const parts = [text];
  for (const match of text.matchAll(/stream\r?\n/g)) {
    const start = match.index + match[0].length;
    const end = text.indexOf('endstream', start);
    try {
      parts.push(inflateSync(pdf.subarray(start, end)).toString('latin1'));
    } catch {
      // Not a deflated stream, such as an image: it holds no font names.
    }
  }
  const all = parts.join('\n');
  const fonts = new Set([...all.matchAll(/\/BaseFont\s*\/([^\s/<>[\]()]+)/g)].map((m) => m[1]));
  const strangers = [...fonts].filter((font) => !OWN_FONTS.test(font));
  const type3 = /\/Subtype\s*\/Type3\b/.test(all);
  if (strangers.length > 0 || type3) {
    throw new Error(
      `${htmlFile}: text printed in ${[...strangers, ...(type3 ? ['a Type3 font'] : [])].join(', ')}. ` +
        'Draw characters the fonts lack as SVG.',
    );
  }
}
