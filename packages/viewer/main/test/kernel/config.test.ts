/**
 * The element's config: which changes a running viewer follows in place, how attributes and
 * `.config` combine, and what a `src` opens.
 */
import { describe, expect, it } from 'vitest';

import {
  changedConfigKeys,
  documentFromSrc,
  idOfSrc,
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
    const buffer = new Uint8Array([1, 2, 3]).buffer;
    const given = await source(buffer);
    expect(given).toMatchObject({ kind: 'bytes', id: 'doc-1' });
    expect('bytes' in given && given.bytes instanceof Uint8Array).toBe(true);
    expect('bytes' in given && (given.bytes as Uint8Array).buffer).toBe(buffer);
  });
});
