/**
 * The viewer probe: the whole viewer, as an app gets it from the entry it imports. The app passes
 * that entry's `EmbedPDF` and a page with a sized `#viewer`; nothing is configured, so whatever the
 * toolchain did with the engine's wasm and workers, the standard stamps and the handwriting fonts
 * shows up here. It opens a PDF from the app's origin and waits for a page to show, opens the
 * stamps panel until the standard stamps are in, and saves a signature typed in each default font,
 * as a person does in the signature maker, checking that the saved library embeds the font.
 */

/** The default handwriting fonts, by their labels, and the name each embeds as. */
const SIGNATURE_FONTS = [
  { label: 'Allura', embedded: 'Allura' },
  { label: 'Great Vibes', embedded: 'GreatVibes' },
  { label: 'Caveat', embedded: 'Caveat' },
];

export async function runViewerProbe(root, EmbedPDF, { src = './sample.pdf' } = {}) {
  const result = { ok: false, entry: 'viewer', steps: {}, errors: [], ms: 0 };
  const started = performance.now();
  const step = async (name, fn) => {
    const t = performance.now();
    const value = await fn();
    result.steps[name] = { ...value, ms: Math.round(performance.now() - t) };
  };
  try {
    const element = EmbedPDF.init({ target: '#viewer', src });
    const shadow = () => element.shadowRoot;

    await step('pages', async () => {
      const image = await until('a page to show', () => {
        const text = shadow()?.textContent ?? '';
        if (!/Page 1 of \d+/.test(text)) return null;
        return [...shadow().querySelectorAll('img')].find(
          (each) => each.src.startsWith('blob:') && each.complete && each.naturalWidth > 0,
        );
      });
      return {
        pageCount: Number(/Page 1 of (\d+)/.exec(shadow().textContent)[1]),
        image: `${image.naturalWidth}x${image.naturalHeight}`,
      };
    });

    await step('stamps', async () => {
      await element.viewer.commands.execute('panel:stamps');
      const library = await until('the standard stamps', () =>
        element.viewer.get('stamp').getLibrary('embedpdf-standard'),
      );
      return { assets: library.assetIds.length };
    });

    await step('signatureFonts', async () => {
      const embedded = {};
      for (const font of SIGNATURE_FONTS) embedded[font.label] = await typeSignature(element, font);
      const missing = SIGNATURE_FONTS.filter((font) => !embedded[font.label]);
      if (missing.length) throw new Error(`not embedded: ${missing.map((f) => f.label)}`);
      // Where each font came from: a chunk of the app's build, on its own origin.
      const chunks = performance
        .getEntriesByType('resource')
        .map((entry) => new URL(entry.name))
        .filter((url) => /\/(allura|great-vibes|caveat)-[^/]*\.js$/.test(url.pathname))
        .map((url) => (url.origin === location.origin ? url.pathname : url.href));
      return { embedded, chunks };
    });

    result.ok = true;
  } catch (error) {
    result.errors.push(String(error && error.stack ? error.stack : error));
  }
  result.ms = Math.round(performance.now() - started);
  root.textContent = JSON.stringify(result);
  root.setAttribute('data-done', '1');
  window.__probe = result;
  return result;
}

/**
 * Types a signature in `font` in the signature maker and saves it, then reads back whether the
 * saved library embeds the font.
 */
async function typeSignature(element, font) {
  const { viewer } = element;
  const person = `Ada ${font.embedded}`;
  viewer.get('shell').open('signature-maker', { exclusive: 'modal' });
  const dialog = await until('the signature maker', () =>
    element.shadowRoot.querySelector('[role="dialog"]'),
  );
  button(dialog, 'Type').click();
  await frames();
  fill(dialog.querySelector('input'), person);
  const select = dialog.querySelector('select');
  const option = [...select.options].find((each) => each.textContent.trim() === font.label);
  select.value = option.value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
  await frames();
  fill(dialog.querySelector('input[placeholder="Type your name"]'), person);
  // Save is enabled once the typed mark is ready, which is once its font is on the engine.
  const save = await until(`${font.label} on the engine`, () => {
    const each = button(dialog, 'Save');
    return each && !each.disabled ? each : null;
  });
  save.click();
  const library = await until(`the signature in ${font.label}`, () =>
    viewer
      .get('stamp')
      .listLibraries({ kind: 'signatures' })
      .find((each) => each.name === person && each.assetIds.length > 0),
  );
  await until('the signature maker to close', () =>
    element.shadowRoot.querySelector('[role="dialog"]') ? null : true,
  );
  const bytes = await viewer.get('stamp').exportLibrary(library.id);
  const text = new TextDecoder('latin1').decode(bytes);
  return (
    new RegExp(`/FontName\\s*/[A-Z]{6}\\+${font.embedded}`).test(text) &&
    text.includes('/FontFile2')
  );
}

const button = (root, label) =>
  [...root.querySelectorAll('button')].find((each) => each.textContent.trim() === label);

/** Sets an input's value as typing does: the viewer listens for `input`. */
function fill(input, value) {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

const frames = () =>
  new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));

/** The first truthy value of `read`, polled; fails after 30 s, naming what it waited for. */
async function until(what, read, timeout = 30_000) {
  const deadline = performance.now() + timeout;
  for (;;) {
    const value = read();
    if (value) return value;
    if (performance.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((done) => setTimeout(done, 50));
  }
}
