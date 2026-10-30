/**
 * The element's config: which changes a running viewer follows in place, how attributes and
 * `.config` combine, what a `src` opens, and what a door adds: how its documents open and the
 * plugin settings its engine needs.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  changedConfigKeys,
  documentFromSrc,
  idOfSrc,
  initialDocumentsOf,
  isLiveConfigKey,
  mergeConfig,
  pluginsOf,
  sameConfigValue,
} from '../../src/kernel/config';

describe('sameConfigValue', () => {
  it('compares arrays and plain objects by their entries', () => {
    expect(sameConfigValue(['forms', 'tool:highlight'], ['forms', 'tool:highlight'])).toBe(true);
    expect(sameConfigValue(['forms'], ['forms', 'search'])).toBe(false);
    expect(sameConfigValue({ except: ['forms.filling'] }, { except: ['forms.filling'] })).toBe(
      true,
    );
    expect(
      sameConfigValue(
        { preference: 'dark', tokens: { accent: '#0f6e56' } },
        { preference: 'dark', tokens: { accent: '#7c3aed' } },
      ),
    ).toBe(false);
  });

  it('treats a missing key and undefined as the same', () => {
    expect(sameConfigValue({ preference: 'dark' }, { preference: 'dark', tokens: undefined })).toBe(
      true,
    );
  });

  it('compares functions, files and bytes by identity', () => {
    const bytes = new Uint8Array([1, 2, 3]);
    expect(sameConfigValue(bytes, bytes)).toBe(true);
    expect(sameConfigValue(bytes, new Uint8Array([1, 2, 3]))).toBe(false);
    expect(
      sameConfigValue(
        () => 1,
        () => 1,
      ),
    ).toBe(false);
  });
});

describe('changedConfigKeys', () => {
  it('names only the keys whose values differ', () => {
    const commands = [{ id: 'acme:send', label: 'Send' }];
    expect(
      changedConfigKeys(
        { src: '/a.pdf', theme: 'light', disable: ['forms'], commands },
        { src: '/b.pdf', theme: 'light', disable: ['forms'], commands },
      ),
    ).toEqual(['src']);
  });

  it('sees a key that was added or removed', () => {
    expect(changedConfigKeys({ theme: 'dark' }, { readOnly: true })).toEqual(['theme', 'readOnly']);
  });
});

describe('isLiveConfigKey', () => {
  it('is true for the five keys a running viewer follows, and nothing else', () => {
    for (const key of ['src', 'theme', 'locale', 'disable', 'readOnly']) {
      expect(isLiveConfigKey(key)).toBe(true);
    }
    for (const key of ['documents', 'commands', 'scope', 'identity', 'notAllowed', 'engine']) {
      expect(isLiveConfigKey(key)).toBe(false);
    }
  });
});

describe('mergeConfig', () => {
  it('puts the config over the attributes, keeping the attributes it leaves out', () => {
    expect(mergeConfig({ src: '/a.pdf', theme: 'dark' }, { theme: 'light' })).toEqual({
      src: '/a.pdf',
      theme: 'light',
    });
  });

  it('keeps an attribute when the config sets its key to undefined, and not when to null', () => {
    expect(mergeConfig({ src: '/a.pdf' }, { src: undefined })).toEqual({ src: '/a.pdf' });
    expect(mergeConfig({ src: '/a.pdf' }, { src: null })).toEqual({ src: null });
  });

  it('is the attributes alone without a config', () => {
    const attributes = { locale: 'es' };
    expect(mergeConfig(attributes, null)).toBe(attributes);
  });
});

describe('a src document', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is named after its URL or its file, without .pdf', () => {
    expect(documentFromSrc('/files/Annual%20Report.pdf?v=2', 'id').name).toBe('Annual Report');
    expect(documentFromSrc(new File([], 'picked.PDF'), 'id').name).toBe('picked');
    expect(documentFromSrc(new Uint8Array(), 'id').name).toBe('Document');
  });

  it('asks for its URL or its file name as its id', () => {
    expect(idOfSrc('/report.pdf')).toBe('/report.pdf');
    expect(idOfSrc(new File([], 'picked.pdf'))).toBe('picked.pdf');
    expect(idOfSrc(new ArrayBuffer(4))).toBe('document');
  });

  it('reads a file and copies given bytes, under the id it was given', async () => {
    const signal = new AbortController().signal;
    const source = (src: File | ArrayBuffer) => {
      const { source: open } = documentFromSrc(src, 'doc-1');
      if (typeof open !== 'function') throw new Error('expected a lazy source');
      return open(signal);
    };
    const file = await source(new File([new Uint8Array([37, 80, 68, 70])], 'a.pdf'));
    expect(file).toMatchObject({ kind: 'bytes', id: 'doc-1' });

    // A view over the app's buffer: the engine copies it rather than moving the buffer away.
    const buffer = new TextEncoder().encode('%PDF-1.7').buffer;
    const given = await source(buffer);
    expect(given).toMatchObject({ kind: 'bytes', id: 'doc-1' });
    expect('bytes' in given && given.bytes instanceof Uint8Array).toBe(true);
    expect('bytes' in given && (given.bytes as Uint8Array).buffer).toBe(buffer);
  });

  it("leaves a URL to the viewer's download, with its fetch, under the id it was given", async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const { source } = documentFromSrc('/report.pdf', '/report.pdf#2');
    if (typeof source !== 'function') throw new Error('expected a lazy source');
    await expect(source(new AbortController().signal)).resolves.toEqual({
      kind: 'url',
      url: '/report.pdf',
      id: '/report.pdf#2',
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("says bytes that aren't a PDF's aren't one, as the engine can't", async () => {
    const open = (src: Uint8Array) => {
      const { source } = documentFromSrc(src, 'id');
      if (typeof source !== 'function') throw new Error('expected a lazy source');
      return source(new AbortController().signal);
    };
    const page = new TextEncoder().encode('<!doctype html><title>Sign in</title>');
    await expect(open(page)).rejects.toMatchObject({ code: 'invalid-input' });
    // The header may come after other bytes, as PDFium allows.
    await expect(open(new TextEncoder().encode('\n\n%PDF-1.4'))).resolves.toMatchObject({
      kind: 'bytes',
    });
  });

  it("opens an engine's open input as it is, once the document before it has closed", async () => {
    const input = { kind: 'token' as const, token: 'eyJ…' };
    let closed: () => void = () => {};
    const before = new Promise<void>((resolve) => (closed = resolve));
    const { source, name } = documentFromSrc(input, 'ignored', before);
    expect(name).toBeUndefined();
    if (typeof source !== 'function') throw new Error('expected a lazy source');
    let given: unknown = null;
    const opening = Promise.resolve(source(new AbortController().signal)).then((value) => {
      given = value;
    });
    await Promise.resolve();
    expect(given).toBeNull();
    closed();
    await opening;
    expect(given).toBe(input);
    expect(idOfSrc({ kind: 'id', id: 'doc_42' })).toBe('doc_42');
  });
});

describe('documents entries', () => {
  it('open in order, each under an id of its own, with its name, password and the active one', () => {
    const documents = initialDocumentsOf([
      { src: '/contract.pdf', name: 'Contract' },
      { src: '/contract.pdf' },
      { src: new File([], 'payroll.pdf'), password: 'secret', active: true },
      { src: { kind: 'id', id: 'doc_42' }, name: 'From the cloud' },
    ]);
    expect(documents.map(({ name, password, active }) => ({ name, password, active }))).toEqual([
      { name: 'Contract', password: undefined, active: undefined },
      { name: 'contract', password: undefined, active: undefined },
      { name: 'payroll', password: 'secret', active: true },
      { name: 'From the cloud', password: undefined, active: undefined },
    ]);
    // An open input opens as it is.
    expect(documents[3]!.source).toEqual({ kind: 'id', id: 'doc_42' });
  });

  it('give two entries of one URL their own ids', async () => {
    const ids = await Promise.all(
      initialDocumentsOf([{ src: '/a.pdf' }, { src: '/a.pdf' }, { src: '/a.pdf' }]).map(
        async ({ source }) => {
          if (typeof source !== 'function') throw new Error('expected a lazy source');
          const given = await source(new AbortController().signal);
          return 'id' in given ? given.id : null;
        },
      ),
    );
    expect(ids).toEqual(['/a.pdf', '/a.pdf#2', '/a.pdf#3']);
  });
});

describe("a door's documents and plugin settings", () => {
  /** The cloud door's words for a document, as a door of its own would have them. */
  const sourceOf = (src: unknown) =>
    typeof src === 'object' && src !== null && 'shareToken' in src
      ? { kind: 'share' as const, shareToken: String(src.shareToken) }
      : (src as string);

  it('open in the words of the door, which turns them into what its engine opens', () => {
    const documents = initialDocumentsOf(
      [{ src: { shareToken: 'shr_1' }, name: 'Shared' }, { src: '/report.pdf' }],
      sourceOf,
    );
    expect(documents[0]).toEqual({
      source: { kind: 'share', shareToken: 'shr_1' },
      name: 'Shared',
    });
    expect(documents[1]!.name).toBe('report');
  });

  it("fail as invalid-input when no door said how they open, and aren't a URL, a file or bytes", async () => {
    const { source } = documentFromSrc({ shareToken: 'shr_1' }, 'document');
    if (typeof source !== 'function') throw new Error('expected a lazy source');
    await expect(source(new AbortController().signal)).rejects.toMatchObject({
      code: 'invalid-input',
    });
  });

  it("put the door's plugin settings under the config's own, plugin by plugin", () => {
    const assetEngine = () => ({}) as never;
    expect(pluginsOf(undefined, { stage: { spread: 'odd' } })).toEqual({
      stage: { spread: 'odd' },
    });
    expect(
      pluginsOf(
        { stamp: { assetEngine } },
        { stamp: { standard: false }, stage: { spread: 'odd' } },
      ),
    ).toEqual({ stamp: { assetEngine, standard: false }, stage: { spread: 'odd' } });
    // A setting the config gives wins.
    const own = () => ({}) as never;
    expect(pluginsOf({ stamp: { assetEngine } }, { stamp: { assetEngine: own } })).toEqual({
      stamp: { assetEngine: own },
    });
  });
});
