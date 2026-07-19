/**
 * Adobe-authored forms carry `!ADBE::…VersChk…` name-tree boot scripts (the
 * XFA/version-check boilerplate) that probe `app` viewer identity and call
 * `app.findComponent`. Regression for the i-140 bug class: those scripts must
 * run cleanly against the prelude's viewer identity (or at worst degrade to a
 * diagnostic) and the user's fill commit must ALWAYS apply. The one visible
 * side effect — Adobe's "upgrade your viewer" alert — must be tagged as
 * boot-phase so embedders can suppress it.
 */
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { createLocalEngine } from '@embedpdf/engine';
import type { DocumentHandle, Engine } from '@embedpdf/engine-core/runtime';
import { createQuickJsSandbox } from '../src';
import { createFormScriptingController } from '../../plugin-form/src/scripting';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(
  here,
  '..',
  '..',
  '..',
  'examples',
  'snippet-react',
  'public',
  'i-140.pdf',
);

describe('Adobe boot-script boilerplate (i-140, hybrid-XFA AcroForm)', () => {
  it('boot scripts never block the fill commit; boot alerts are suppressible', async () => {
    const engine: Engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
    let doc: DocumentHandle | undefined;
    try {
      const bytes = new Uint8Array(await readFile(fixturePath));
      doc = await engine.open({ kind: 'bytes', id: 'i-140-boot', bytes });
      const snapshot = await doc.forms.list();
      expect(snapshot.formKind).toBe('xfa'); // hybrid: filled via its AcroForm plane
      const text = snapshot.fields.find((f) => f.family === 'text' && !f.flags.readOnly)!;

      const controller = createFormScriptingController({
        doc,
        document: () => null,
        config: { enabled: true },
        sandboxFactory: async () => createQuickJsSandbox(),
      });
      const result = await controller.commit(snapshot, text.ref, {
        type: 'text',
        value: 'FAMILY-NAME',
      });
      controller.dispose();

      // The commit APPLIES — the boot boilerplate can never brick filling.
      expect(result.status).toBe('applied');
      expect(result.error).toBeUndefined();

      // Any UI the boot scripts requested (the Adobe upgrade nag) is tagged
      // boot-phase; nothing user-phase fired for a plain value commit.
      for (const effect of result.uiEffects) {
        expect(effect.phase).toBe('boot');
      }

      // And the value really landed engine-side.
      const after = await doc.forms.list();
      const same = after.fields.find((f) => f.fieldObjectNumber === text.fieldObjectNumber)!;
      expect(same.valueEntry).toEqual({ kind: 'scalar', value: 'FAMILY-NAME' });
    } finally {
      await doc?.close().catch(() => {});
      await engine.destroy();
    }
  }, 120_000);
});
