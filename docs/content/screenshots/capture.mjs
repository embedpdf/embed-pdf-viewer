/**
 * Screenshots of the CloudPDF dashboard for cloudpdf.com's Platform docs.
 *
 * The script drives the real dashboard: it signs in, fills a workspace with the docs' own
 * Fernquill PDFs, then clicks through each screen a page shows and takes its picture. Nobody edits
 * a screenshot by hand, so when the dashboard changes, running this again brings every picture
 * up to date. See README.md for the stack it needs.
 *
 *   CLOUDPDF_DOCS_EMAIL=… CLOUDPDF_DOCS_PASSWORD=… pnpm --filter @embedpdf/docs-content screenshots
 *   … screenshots grant-dialog grant-embed      only these (the rest still run, unsaved)
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright-core';

const here = dirname(fileURLToPath(import.meta.url));
const SITE = resolve(here, '../../../cloudpdf/website');
const SHOTS_DIR = resolve(SITE, 'public/docs/platform');
const MANIFEST = resolve(SITE, 'src/generated/platform-screenshots.json');
const PDFS = resolve(SITE, 'public/pdfs');

const APP = (process.env.CLOUDPDF_DOCS_APP ?? 'http://localhost:3320').replace(/\/$/, '');
/** The engine the dashboard's control plane uses, which visitors' sessions open on. */
const ENGINE = (process.env.CLOUDPDF_DOCS_ENGINE ?? 'http://127.0.0.1:4110').replace(/\/$/, '');
const WORKSPACE = process.env.CLOUDPDF_DOCS_WORKSPACE ?? 'Fernquill Studio';
const chrome =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name}: the dashboard account the screenshots are taken as.`);
  return value;
}

/** The workspace every screenshot shows: Fernquill's documents, some in folders. */
const DOCUMENTS = [
  { pdf: 'links', name: 'Brand guidelines.pdf' },
  { pdf: 'report', name: 'Q3 2026 report.pdf' },
  { pdf: 'sketch', name: 'Studio floor plan.pdf' },
  { pdf: 'agreement', name: 'Support agreement.pdf', folder: 'Clients' },
  { pdf: 'invoice', name: 'Order form and invoice.pdf', folder: 'Clients' },
  { pdf: 'layout', name: 'Website redesign.pdf', folder: 'Design' },
  { pdf: 'proposal', name: 'Comments sidebar proposal.pdf', folder: 'Design' },
  { pdf: 'approvals', name: 'Spending approvals Q4 2026.pdf', folder: 'Finance' },
];
/** The document the website quick start puts online. */
const WEBSITE_DOCUMENT = 'Brand guidelines.pdf';
/** The API key the app quick start makes. */
const APP_KEY = 'Fernquill app';
/** The dashboard's Read level, and the permissions Comment adds. */
const LEVEL_READ = ['doc.open', 'doc.render', 'doc.text.select', 'doc.text.search', 'doc.annotate.read', 'doc.forms.read'];
const COMMENT = ['annotations:create:self', 'annotations:update:self', 'annotations:delete:self'];
/** The client review's passphrase: a made-up one, shown in the docs. */
const REVIEW_PASSPHRASE = 'quill-review-2026';
/** Stands in for a real key, so no secret is ever in a picture. */
const SAMPLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0eXAiOiJ0ZW5hbnQiLCJzdWIiOiJrZXlfN2Y5YzJlIiwidGVuYW50IjoiZmVybnF1aWxsIn0.Qm9n4qUu0bXl8WcR2s1T7d5rKpV3yZe6HnLaJfGiOcA';

const requested = new Set(process.argv.slice(2));
const saved = [];

/** Calm, repeatable pixels: no transitions, no caret, no dev overlay, and a ring for the target. */
/** In the page: hides (or shows again) every card on the page but `card`. */
const SET_OTHERS_HIDDEN = `window.setOthersHidden = (card, hidden) => {
  for (const other of document.querySelectorAll('main section')) {
    if (other !== card) other.style.visibility = hidden ? 'hidden' : '';
  }
};`;

const SHOT_CSS = `
  *, *::before, *::after { transition: none !important; animation: none !important; caret-color: transparent !important; }
  nextjs-portal { display: none !important; }
  dialog[open]::backdrop { background: #eef2f8 !important; }
  [data-shot-ring] { outline: 3px solid #1677ff !important; outline-offset: 3px !important; box-shadow: 0 0 0 9px rgba(22, 119, 255, 0.16) !important; }
`;

const browser = await chromium.launch({ executablePath: chrome, args: ['--hide-scrollbars'] });
try {
  const context = await browser.newContext({
    colorScheme: 'light',
    deviceScaleFactor: 2,
    locale: 'en-US',
    timezoneId: 'Europe/Amsterdam',
    viewport: { width: 1280, height: 800 },
  });
  await context.addInitScript(SET_OTHERS_HIDDEN);
  const page = await context.newPage();

  const organization = await signIn(page);
  const org = `organizations/${organization}`;
  const documents = await fillWorkspace(page, org);
  const website = documents.get(WEBSITE_DOCUMENT);

  // Put a PDF on your website.
  await open(page, '/documents');
  await page.getByText(WEBSITE_DOCUMENT).first().waitFor();
  await thumbnailsLoaded(page);
  await shot(page, 'documents', { ring: page.getByRole('button', { name: 'Upload', exact: true }) });

  await endGrants(page, org, website);
  await open(page, `/documents/${website}`);
  await page.getByText('No grants yet').waitFor();
  await thumbnailsLoaded(page);
  await shot(page, 'new-grant', { ring: page.getByRole('button', { name: 'New grant' }) });

  await page.getByRole('button', { name: 'New grant' }).click();
  const grantDialog = page.locator('dialog[open]');
  await grantDialog.getByLabel('Name').fill('Website');
  await shot(page, 'grant-dialog', {
    clip: grantDialog,
    ring: grantDialog.getByRole('button', { name: 'Create grant' }),
  });

  await grantDialog.getByRole('button', { name: 'Create grant' }).click();
  await grantDialog.getByText('Grant created').waitFor();
  await grantDialog.getByRole('tab', { name: 'Embed on a website' }).click();
  await shot(page, 'grant-embed', {
    clip: grantDialog,
    ring: grantDialog.getByRole('button', { name: 'Copy embed code' }),
  });
  await grantDialog.getByRole('tab', { name: 'Send the link' }).click();
  await shot(page, 'grant-link', {
    clip: grantDialog,
    ring: grantDialog.getByRole('button', { name: /^Copy https:/ }),
  });
  await grantDialog.getByRole('button', { name: 'Done' }).click();

  // Grants: a second grant with every option, a few visitors, then each setting in the dialog.
  const review = await clientReview(page, org, website);
  await visit(review.id, [
    { displayName: 'Sam Okafor', email: 'sam@lanternfield.example', organization: 'Lanternfield' },
    { displayName: 'Mira Patel', email: 'mira@lanternfield.example', organization: 'Lanternfield' },
  ]);
  await open(page, `/documents/${website}`);
  const grantsCard = page.locator('section', { has: page.getByRole('heading', { name: 'Grants' }) });
  await grantsCard.getByText('Client review').waitFor();
  await shot(page, 'grants-list', { clip: grantsCard, isolate: true });

  await grantsCard.locator('li', { hasText: 'Client review' }).getByRole('button', { name: 'Grant actions' }).click();
  await shot(page, 'grant-menu', {
    clip: grantsCard,
    isolate: true,
    ring: page.getByRole('menuitem', { name: 'End grant' }),
  });
  await page.getByRole('menuitem', { name: 'Visitors' }).click();
  const visitorsDialog = page.locator('dialog[open]');
  await visitorsDialog.getByText('Sam Okafor').waitFor();
  await shot(page, 'grant-visitors', { clip: visitorsDialog });
  await page.keyboard.press('Escape');

  await grantsCard.locator('li', { hasText: 'Client review' }).getByRole('button', { name: 'Grant actions' }).click();
  await page.getByRole('menuitem', { name: 'End grant' }).click();
  const endDialog = page.locator('dialog[open]');
  await shot(page, 'grant-end', {
    clip: endDialog,
    ring: endDialog.getByRole('button', { name: 'End grant' }),
  });
  await endDialog.getByRole('button', { name: 'Cancel' }).click();

  // The dialog's settings, one picture each; this grant is never made.
  await page.setViewportSize({ width: 1280, height: 1080 });
  await open(page, `/documents/${website}`);
  await page.getByRole('button', { name: 'New grant' }).click();
  const settings = page.locator('dialog[open]');
  await settings.getByRole('button', { name: 'Comment', exact: true }).click();
  await settings.getByLabel('Download').check();
  await settings.getByLabel('Print').check();
  await shot(page, 'grant-permissions', {
    clip: settings,
    ring: settings.getByRole('button', { name: 'Comment', exact: true }),
  });
  await shot(page, 'grant-changes', { clip: fieldset(settings, 'Who sees changes'), room: 14 });

  await settings.getByRole('button', { name: /^Only on my websites/ }).click();
  await settings.getByLabel('Websites').fill('https://www.fernquill.example, https://*.fernquill.example');
  await shot(page, 'grant-where', { clip: fieldset(settings, 'Where it opens'), room: 14 });

  // More options and the full permission list make the dialog taller than the window.
  await page.setViewportSize({ width: 1280, height: 2000 });
  await settings.getByRole('button', { name: 'More options' }).click();
  await settings.getByLabel('Passphrase').fill('quill-review-2026');
  // No expiry date: Chrome writes it in the computer's region format, which differs per machine.
  await settings.getByText('Ask who they are').click();
  await settings.getByLabel('Name: ask or not').selectOption('required');
  await settings.getByLabel('Email: ask or not').selectOption('required');
  await settings.getByLabel('Company: ask or not').selectOption('optional');
  await settings.getByLabel('Why you ask').fill('We reply to every comment.');
  await settings.getByLabel('Privacy notice').fill('https://www.fernquill.example/privacy');
  await shot(page, 'grant-more', { clip: settings.locator('div.border-l-2'), room: 6 });

  await settings.getByRole('button', { name: 'More options' }).click();
  await settings.getByRole('button', { name: 'Customize permissions' }).click();
  await shot(page, 'grant-customize', { clip: fieldset(settings, 'People can'), room: 14 });
  await settings.getByRole('button', { name: 'Cancel' }).click();
  await page.setViewportSize({ width: 1280, height: 800 });

  // Add PDFs to your app.
  await revokeKeys(page, org, APP_KEY);
  // The key dialog is taller than the window the other screens are shown in.
  await page.setViewportSize({ width: 1280, height: 1080 });
  await open(page, '/api-keys');
  await page.getByRole('button', { name: 'New API key' }).click();
  const keyDialog = page.locator('dialog[open]');
  await keyDialog.getByLabel('Name').fill(APP_KEY);
  await keyDialog.getByRole('button', { name: /^Restricted/ }).click();
  await setRow(keyDialog, 'Documents and folders', 'Write');
  await setRow(keyDialog, 'Viewer tokens', 'On');
  await shot(page, 'api-key-dialog', {
    clip: keyDialog,
    ring: keyDialog.getByRole('button', { name: 'Create API key' }),
  });

  await keyDialog.getByRole('button', { name: 'Create API key' }).click();
  const created = page.locator('div.border-emerald-200');
  await created.waitFor();
  await created.locator('pre').evaluate((pre, sample) => {
    pre.textContent = sample;
  }, SAMPLE_KEY);
  await shot(page, 'api-key-created', {
    // The Keys card the key appears in, so the picture shows where to find it.
    clip: created.locator('xpath=ancestor::section[1]'),
    ring: created.getByRole('button', { name: 'Copy API key' }),
  });
  await created.getByRole('button', { name: "I’ve stored it" }).click();
  await page.setViewportSize({ width: 1280, height: 800 });
  await shot(page, 'api-keys');
  await revokeKeys(page, org, APP_KEY);

  // Documents: a folder, and a search across all of them.
  const clients = (await api(page, `${org}/folders?parentId=root`)).folders.find(
    (folder) => folder.name === 'Clients',
  );
  await open(page, `/documents?folder=${clients.id}`);
  await page.getByText('Support agreement.pdf').first().waitFor();
  await thumbnailsLoaded(page);
  await shot(page, 'folder');

  await open(page, '/documents');
  await page.getByPlaceholder('Search all documents').fill('2026');
  await page.getByText('Spending approvals Q4 2026.pdf').first().waitFor();
  await thumbnailsLoaded(page);
  await shot(page, 'search');

  // Workspace.
  for (const [name, path] of [
    ['members', '/members'],
    ['usage', '/usage'],
  ]) {
    await open(page, path);
    await page.waitForLoadState('networkidle');
    await shot(page, name);
  }

  await writeManifest();
  console.log(`Saved ${saved.length} screenshot(s): ${saved.join(', ') || 'none'}.`);
} finally {
  await browser.close();
}

/** Picks one of a key permission row's choices (None / Read / Write, or Off / On). */
async function setRow(dialog, row, choice) {
  await dialog
    .locator(`[role="radiogroup"][aria-label="${row}"]`)
    .getByText(choice, { exact: true })
    .click();
}

/** Signs in on the account site when the dashboard asks, then opens the docs workspace. */
async function signIn(page) {
  await page.goto(`${APP}/documents`);
  const signedIn = await page.evaluate(
    async () => (await fetch('/api/platform/v1/saas/account', { credentials: 'include' })).ok,
  );
  if (!signedIn) {
    // The dashboard sends a visitor without a session to the account site's sign-in.
    await page.waitForURL((url) => url.searchParams.get('mode') === 'sign-in', { timeout: 30_000 });
    await page.locator('input[name="email"]').fill(required('CLOUDPDF_DOCS_EMAIL'));
    await page.locator('input[name="password"]').fill(required('CLOUDPDF_DOCS_PASSWORD'));
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.waitForURL((url) => url.href.startsWith(APP), { timeout: 30_000 });
  }
  const account = await api(page, 'account');
  const workspace = account.organizations.find((candidate) => candidate.name === WORKSPACE);
  if (!workspace) {
    throw new Error(`The account has no workspace named "${WORKSPACE}" (CLOUDPDF_DOCS_WORKSPACE).`);
  }
  if (account.activeOrganizationId !== workspace.id) {
    // `?org=` makes it the session's workspace, once the dashboard has loaded.
    await page.goto(`${APP}/documents?org=${workspace.id}`);
    const deadline = Date.now() + 15_000;
    while ((await api(page, 'account')).activeOrganizationId !== workspace.id) {
      if (Date.now() > deadline) throw new Error(`Couldn't switch to "${WORKSPACE}".`);
      await page.waitForTimeout(250);
    }
  }
  return workspace.id;
}

/** Makes the folders and uploads the documents the workspace doesn't have yet; their ids by name. */
async function fillWorkspace(page, org) {
  const folders = new Map(
    (await api(page, `${org}/folders?parentId=root`)).folders.map((folder) => [folder.name, folder.id]),
  );
  for (const name of new Set(DOCUMENTS.map((entry) => entry.folder).filter(Boolean))) {
    if (!folders.has(name)) {
      const { folder } = await api(page, `${org}/folders`, { body: { name, parentId: 'root' } });
      folders.set(name, folder.id);
    }
  }

  const ids = new Map();
  for (const place of ['root', ...new Set(DOCUMENTS.map((entry) => entry.folder).filter(Boolean))]) {
    const folderId = place === 'root' ? 'root' : folders.get(place);
    const wanted = DOCUMENTS.filter((entry) => (entry.folder ?? 'root') === place);
    const listed = async () =>
      (await api(page, `${org}/documents?folderId=${folderId}&sort=name&order=asc`)).documents;
    let present = await listed();
    const toUpload = wanted.filter((entry) => !present.some((doc) => doc.name === entry.name));
    if (toUpload.length > 0) {
      // Through the dashboard's own upload, the way a person adds them.
      await open(page, place === 'root' ? '/documents' : `/documents?folder=${folderId}`);
      await page.locator('input[type="file"]').setInputFiles(
        await Promise.all(
          toUpload.map(async (entry) => ({
            buffer: await readFile(resolve(PDFS, `${entry.pdf}.pdf`)),
            mimeType: 'application/pdf',
            name: entry.name,
          })),
        ),
      );
      const deadline = Date.now() + 60_000;
      do {
        await page.waitForTimeout(500);
        present = await listed();
      } while (
        Date.now() < deadline &&
        !wanted.every((entry) =>
          present.some((doc) => doc.name === entry.name && doc.state === 'ready'),
        )
      );
    }
    for (const entry of wanted) {
      const doc = present.find((candidate) => candidate.name === entry.name);
      if (!doc) throw new Error(`"${entry.name}" didn't upload into ${place}.`);
      ids.set(entry.name, doc.id);
    }
  }
  return ids;
}

/** A fieldset of the grant dialog, by its legend. */
function fieldset(dialog, legend) {
  return dialog.locator('fieldset', { has: dialog.page().locator('legend', { hasText: legend }) });
}

/**
 * The grants page's second grant: a client review that asks who visitors are, with comments,
 * downloads and printing, and a passphrase.
 */
async function clientReview(page, org, docId) {
  const { grant } = await api(page, `${org}/grants`, {
    body: {
      docId,
      name: 'Client review',
      scope: [...LEVEL_READ, ...COMMENT, 'doc.download', 'doc.download.flattened', 'doc.print', 'doc.print.high'],
      layerMode: 'shared',
      passphrase: REVIEW_PASSPHRASE,
      visitorIdentity: {
        ask: 'on-open',
        fields: { displayName: 'required', email: 'required', organization: 'optional' },
        purpose: 'We reply to every comment.',
      },
    },
  });
  return grant;
}

/** Opens a grant as each of these visitors, the way the viewer does, so the grant has visitors. */
async function visit(grant, visitors) {
  for (const visitorIdentity of visitors) {
    const response = await fetch(`${ENGINE}/v1/grant-sessions`, {
      body: JSON.stringify({ grant, passphrase: REVIEW_PASSPHRASE, visitorIdentity }),
      // A grant opens from a web page, which a browser always names.
      headers: { 'content-type': 'application/json', origin: 'https://www.fernquill.example' },
      method: 'POST',
    });
    if (!response.ok) throw new Error(`Opening ${grant} answered ${response.status}: ${await response.text()}`);
  }
}

/** Ends a document's grants, so its page shows none. */
async function endGrants(page, org, docId) {
  for (const grant of (await api(page, `${org}/grants?docId=${docId}`)).grants) {
    await api(page, `${org}/grants/${grant.id}`, { method: 'DELETE' }).catch(() =>
      api(page, `${org}/grants/${grant.id}/archive`, { method: 'POST' }),
    );
  }
}

/** Revokes the keys a run made, so they never pile up in the workspace. */
async function revokeKeys(page, org, name) {
  for (const key of (await api(page, `${org}/api-keys`)).apiKeys) {
    if (key.name === name && key.status === 'active') {
      await api(page, `${org}/api-keys/${key.id}/revoke`, { method: 'POST' });
    }
  }
}

async function open(page, path) {
  await page.goto(`${APP}${path}`);
  await page.addStyleTag({ content: SHOT_CSS });
  await page.locator('main').first().waitFor();
}

/** Waits for every image on the page, such as the document thumbnails, to finish loading. */
async function thumbnailsLoaded(page) {
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(() => [...document.images].every((image) => image.complete));
}

/**
 * Takes a screenshot: the window, or `clip` with `room` around it. `ring` marks what the reader
 * clicks next; `isolate` hides the page's other cards, so a card's room shows none of theirs.
 */
async function shot(page, name, { clip, ring, isolate = false, room = 28 } = {}) {
  await page.addStyleTag({ content: SHOT_CSS });
  // No text field shows a focus ring of its own: the ring is for what to click.
  await page.evaluate(() => document.activeElement?.blur?.());
  if (ring) await ring.evaluate((element) => element.setAttribute('data-shot-ring', ''));
  if (isolate) await clip.evaluate((card) => window.setOthersHidden(card, true));
  // Let a ring or a tab change paint before the picture.
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  let area;
  if (clip) {
    const box = await clip.boundingBox();
    const viewport = page.viewportSize();
    const x = Math.max(0, box.x - room);
    const y = Math.max(0, box.y - room);
    area = {
      x,
      y,
      width: Math.min(viewport.width, box.x + box.width + room) - x,
      height: Math.min(viewport.height, box.y + box.height + room) - y,
    };
  }
  const png = await page.screenshot({ clip: area, animations: 'disabled' });
  if (ring) await ring.evaluate((element) => element.removeAttribute('data-shot-ring'));
  if (isolate) await clip.evaluate((card) => window.setOthersHidden(card, false));
  if (requested.size > 0 && !requested.has(name)) return;
  await mkdir(SHOTS_DIR, { recursive: true });
  await writeFile(resolve(SHOTS_DIR, `${name}.png`), png);
  saved.push(name);
}

/** The size of every picture in the folder, from its PNG header, for `<Screenshot>`. */
async function writeManifest() {
  const existing = JSON.parse(await readFile(MANIFEST, 'utf8').catch(() => '{"shots":{}}'));
  for (const name of saved) {
    const png = await readFile(resolve(SHOTS_DIR, `${name}.png`));
    existing.shots[name] = {
      file: `${name}.png`,
      width: png.readUInt32BE(16),
      height: png.readUInt32BE(20),
    };
  }
  const shots = Object.fromEntries(Object.entries(existing.shots).sort(([a], [b]) => a.localeCompare(b)));
  await writeFile(MANIFEST, `${JSON.stringify({ shots }, null, 2)}\n`);
}

/** The dashboard's own API, called from the signed-in page. */
async function api(page, path, { body, method = body === undefined ? 'GET' : 'POST' } = {}) {
  const result = await page.evaluate(
    async ({ path, method, body }) => {
      const response = await fetch(`/api/platform/v1/saas/${path}`, {
        body: body === undefined ? undefined : JSON.stringify(body),
        credentials: 'include',
        headers: body === undefined ? {} : { 'content-type': 'application/json' },
        method,
      });
      const text = await response.text();
      return { status: response.status, body: text ? JSON.parse(text) : null };
    },
    { path, method, body },
  );
  if (result.status >= 400) {
    throw new Error(`${method} ${path} answered ${result.status}: ${JSON.stringify(result.body)}`);
  }
  return result.body;
}
