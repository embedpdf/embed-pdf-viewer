/**
 * The element's config: which changes a running viewer follows in place, how attributes and
 * `.config` combine, and what a `src` opens.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  changedConfigKeys,
  documentFromSrc,
  idOfSrc,
  initialDocumentsOf,
  isLiveConfigKey,
  mergeConfig,
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

  it('says why a URL could not be downloaded: not found, or the download failed', async () => {
    const respond = (status: number) =>
      vi.fn(async () => ({ ok: false, status, arrayBuffer: async () => new ArrayBuffer(0) }));
    const open = (url: string) => {
      const { source } = documentFromSrc(url, url);
      if (typeof source !== 'function') throw new Error('expected a lazy source');
      return source(new AbortController().signal);
    };
    vi.stubGlobal('fetch', respond(404));
    await expect(open('/missing.pdf')).rejects.toMatchObject({
      name: 'PluginError',
      code: 'not-found',
    });
    vi.stubGlobal('fetch', respond(500));
    await expect(open('/broken.pdf')).rejects.toMatchObject({ code: 'operation-failed' });
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
  afterEach(() => vi.unstubAllGlobals());

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
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        arrayBuffer: async () => new TextEncoder().encode('%PDF-1.7').buffer,
      })),
    );
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
