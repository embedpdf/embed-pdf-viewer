/**
 * Opening documents: every input kind opens a locked file locked, a wrong
 * password says so on the prompt, the owner password lifts the file's own
 * restrictions, the refusals name what they refuse, and an aborted open leaves
 * its id free to open again.
 * `encrypted.pdf` is PDFium's: user password `1234` (no copy, no print),
 * owner password `5678`.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, test, vi } from 'vitest';
import { isAbortError, type DocumentHandle, type OpenInput } from '@embedpdf/engine-core/runtime';
import { createLocalEngine, EngineError, EngineErrorCode } from '../src/index';

const fixture = (name: string) => resolve(__dirname, 'fixtures', name);
const encrypted = () => readFile(fixture('encrypted.pdf')).then((b) => new Uint8Array(b));
const plain = () => readFile(fixture('hello_world.pdf')).then((b) => new Uint8Array(b));

async function withEngine<T>(
  run: (engine: ReturnType<typeof createLocalEngine>) => Promise<T>,
  prefer: 'wasm' | 'native' = 'wasm',
): Promise<T> {
  const engine = createLocalEngine({ runtime: { prefer } });
  try {
    return await run(engine);
  } finally {
    await engine.destroy();
  }
}

async function rejection(call: Promise<unknown>): Promise<unknown> {
  return call.then(
    () => null,
    (error: unknown) => error,
  );
}

const inputs: Array<[string, () => Promise<OpenInput>, 'wasm' | 'native']> = [
  ['bytes', async () => ({ kind: 'bytes', bytes: await encrypted() }), 'wasm'],
  ['layerBytes', async () => ({ kind: 'layerBytes', baseBytes: await encrypted() }), 'wasm'],
  ['layerFile', async () => ({ kind: 'layerFile', basePath: fixture('encrypted.pdf') }), 'native'],
];

describe.each(inputs)('a locked file opened as %s', (_kind, input, prefer) => {
  test('opens locked without a password, and unlocks', async () => {
    await withEngine(async (engine) => {
      const doc = await engine.open(await input(), { scope: ['*'] });
      expect(doc.security.passwordPrompt).toEqual({
        state: 'required',
        hint: null,
        incorrect: false,
      });
      const locked = await rejection(doc.pages.list());
      expect(EngineError.is(locked, EngineErrorCode.DocPasswordRequired)).toBe(true);

      await doc.security.unlock({ password: '1234' });
      expect(doc.security.passwordPrompt.state).not.toBe('required');
      expect((await doc.pages.list()).pageCount).toBeGreaterThan(0);
      await doc.close();
    }, prefer);
  });

  test('opens locked with a wrong password, and the prompt says it was wrong', async () => {
    await withEngine(async (engine) => {
      const doc = await engine.open(await input(), { scope: ['*'], password: 'tiger' });
      expect(doc.security.passwordPrompt).toMatchObject({ state: 'required', incorrect: true });

      const wrong = await rejection(doc.security.unlock({ password: 'lion' }));
      expect(EngineError.is(wrong, EngineErrorCode.DocPasswordIncorrect)).toBe(true);
      expect(doc.security.passwordPrompt).toMatchObject({ state: 'required', incorrect: true });

      await doc.security.unlock({ password: '1234' });
      expect(doc.security.passwordPrompt.state).not.toBe('required');
      await doc.close();
    }, prefer);
  });
});

describe('the file’s own restrictions', () => {
  test('the owner password lifts them for pdf.permissions', async () => {
    await withEngine(async (engine) => {
      const doc: DocumentHandle = await engine.open(
        { kind: 'bytes', bytes: await encrypted() },
        { scope: ['pdf.permissions'], password: '1234' },
      );
      expect(doc.security.allows('doc.text.copy')).toBe(false);
      expect(doc.security.allows('doc.print')).toBe(false);

      await doc.security.unlock({ password: '5678', mode: 'owner' });
      expect(doc.security.allows('doc.text.copy')).toBe(true);
      expect(doc.security.allows('doc.print')).toBe(true);
      await doc.close();
    });
  });

  test('a file opened locked gets the permissions of the password it unlocks with', async () => {
    await withEngine(async (engine) => {
      const doc = await engine.open(
        { kind: 'bytes', bytes: await encrypted() },
        { scope: ['pdf.permissions'] },
      );
      await doc.security.unlock({ password: '5678' });
      expect(doc.security.allows('doc.text.copy')).toBe(true);
      await doc.close();
    });
  });
});

describe('without a scope', () => {
  /** What no PDF flag governs, which the file never takes away. */
  const UNFLAGGED = [
    'doc.download',
    'doc.download.flattened',
    'doc.annotate.import',
    'doc.forms.import',
    'doc.forms.script',
    'doc.forms.submit',
    'doc.sign.certify',
  ] as const;

  test('a document allows what the file allows: everything, for a file without restrictions', async () => {
    await withEngine(async (engine) => {
      const doc = await engine.open({ kind: 'bytes', bytes: await plain() });
      for (const capability of [
        'doc.print',
        'doc.print.high',
        'doc.text.copy',
        'doc.annotate.modify',
        'doc.forms.modify',
        'doc.pages.modify',
        'doc.redact',
        ...UNFLAGGED,
      ] as const) {
        expect(doc.security.allows(capability), capability).toBe(true);
      }
      await doc.close();
    });
  });

  test('a protected file keeps its restrictions, and the owner password lifts them', async () => {
    await withEngine(async (engine) => {
      const doc = await engine.open(
        { kind: 'bytes', bytes: await encrypted() },
        { password: '1234' },
      );
      expect(doc.security.allows('doc.print')).toBe(false);
      expect(doc.security.allows('doc.text.copy')).toBe(false);
      // Finding and selecting text aren't copying it, as in Acrobat.
      expect(doc.security.allows('doc.text.search')).toBe(true);
      expect(doc.security.allows('doc.text.select')).toBe(true);
      for (const capability of UNFLAGGED) {
        expect(doc.security.allows(capability), capability).toBe(true);
      }

      await doc.security.unlock({ password: '5678', mode: 'owner' });
      expect(doc.security.allows('doc.print')).toBe(true);
      expect(doc.security.allows('doc.text.copy')).toBe(true);
      await doc.close();
    });
  });

  test('the USCIS Form I-140 as published: found and selected, not copied, its pages kept', async () => {
    // Its flags allow printing, commenting and filling in; not copying or changing pages.
    await withEngine(async (engine) => {
      const bytes = new Uint8Array(await readFile(fixture('uscis-i-140-protected.pdf')));
      const doc = await engine.open({ kind: 'bytes', bytes });
      const allows = (capability: Parameters<typeof doc.security.allows>[0]) =>
        doc.security.allows(capability);
      expect([allows('doc.text.search'), allows('doc.text.select')]).toEqual([true, true]);
      expect([allows('doc.text.copy'), allows('doc.content.copy')]).toEqual([false, false]);
      expect([
        allows('doc.print'),
        allows('doc.annotate.modify'),
        allows('doc.forms.fill'),
      ]).toEqual([true, true, true]);
      expect([allows('doc.pages.assemble'), allows('doc.forms.modify')]).toEqual([false, false]);
      await doc.close();
    });
  });

  test('says nothing in the console', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await withEngine(async (engine) => {
        const doc = await engine.open({ kind: 'bytes', bytes: await plain() });
        await doc.close();
      });
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});

describe('opening', () => {
  test('an id is generated when there is none', async () => {
    await withEngine(async (engine) => {
      const a = await engine.open({ kind: 'bytes', bytes: await plain() }, { scope: ['*'] });
      const b = await engine.open(
        { kind: 'layerBytes', baseBytes: await plain() },
        { scope: ['*'] },
      );
      expect(a.id).toBeTruthy();
      expect(b.id).toBeTruthy();
      expect(a.id).not.toBe(b.id);
      await a.close();
      await b.close();
    });
  });

  test('a scope without doc.open is refused before the file is read', async () => {
    await withEngine(async (engine) => {
      const refused = await rejection(
        engine.open({ kind: 'bytes', bytes: await plain() }, { scope: ['doc.render'] }),
      );
      expect(EngineError.is(refused, EngineErrorCode.Forbidden)).toBe(true);
      expect((refused as EngineError).details?.['required']).toBe('doc.open');

      // pdf.permissions is a working session: it grants doc.open.
      const doc = await engine.open(
        { kind: 'bytes', bytes: await plain() },
        { scope: ['pdf.permissions'] },
      );
      expect((await doc.pages.list()).pageCount).toBe(1);
      await doc.close();
    });
  });

  // The worker can't stop an open once it runs, so an open its caller aborted
  // may still open the file there. Its id must be free to open again.
  test.each([
    ['bytes', (id: string, bytes: Uint8Array): OpenInput => ({ kind: 'bytes', id, bytes })],
    [
      'layerBytes',
      (id: string, bytes: Uint8Array): OpenInput => ({ kind: 'layerBytes', id, baseBytes: bytes }),
    ],
  ])('an open of %s aborted after it was sent leaves its id free', async (_kind, input) => {
    await withEngine(async (engine) => {
      const bytes = await plain();
      const left = engine.open(input('welcome', bytes));
      left.abort('left');
      expect(isAbortError(await rejection(left))).toBe(true);

      const doc = await engine.open(input('welcome', bytes));
      expect((await doc.pages.list()).pageCount).toBe(1);
      await doc.close();
    });
  });

  test('opening the same id again before the worker answers the aborted open', async () => {
    await withEngine(async (engine) => {
      const bytes = await plain();
      const left = engine.open({ kind: 'bytes', id: 'welcome', bytes });
      left.abort('left');
      const again = engine.open({ kind: 'bytes', id: 'welcome', bytes });
      expect(isAbortError(await rejection(left))).toBe(true);

      const doc = await again;
      expect((await doc.pages.list()).pageCount).toBe(1);
      await doc.close();
    });
  });

  test('a layerFile on the wasm runtime is NotImplemented', async () => {
    await withEngine(async (engine) => {
      const refused = await rejection(
        engine.open({ kind: 'layerFile', basePath: fixture('hello_world.pdf') }, { scope: ['*'] }),
      );
      expect(EngineError.is(refused, EngineErrorCode.NotImplemented)).toBe(true);
    });
  });

  test('inserting a password-protected PDF is DocPasswordRequired', async () => {
    await withEngine(async (engine) => {
      const doc = await engine.open({ kind: 'bytes', bytes: await plain() }, { scope: ['*'] });
      const refused = await rejection(doc.pages.insert(await encrypted()));
      expect(EngineError.is(refused, EngineErrorCode.DocPasswordRequired)).toBe(true);
      await doc.close();
    });
  });
});
