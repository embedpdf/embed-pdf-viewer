import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { createLocalEngine } from '@embedpdf/engine';
import type { DocumentHandle, FormEffect, FormFieldRef } from '@embedpdf/engine-core/runtime';
import {
  javaScriptProgramFromActionTree,
  scriptFieldsFromSnapshot,
  type ScriptFieldInput,
  type ScriptInput,
} from '@embedpdf/core-acrojs';
import { createQuickJsSandbox } from '../src';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(here, 'fixtures', 'EmbedPDF_Dynamic_Approval_Stamp.pdf');

function sameRef(left: FormFieldRef, right: FormFieldRef): boolean {
  return left.kind === 'objectNumber' && right.kind === 'objectNumber'
    ? left.fieldObjectNumber === right.fieldObjectNumber
    : left.kind === 'fqn' && right.kind === 'fqn'
      ? left.name === right.name
      : false;
}

function applyOverlay(fields: ScriptFieldInput[], effects: FormEffect[]): void {
  for (const effect of effects) {
    if (effect.kind === 'reset') {
      for (const ref of effect.refs) {
        const field = fields.find((candidate) => sameRef(candidate.ref, ref));
        if (field) field.value = field.defaultValue;
      }
      continue;
    }
    const field = fields.find((candidate) => sameRef(candidate.ref, effect.ref));
    if (!field) continue;
    if (effect.kind === 'setDisplay') field.display = effect.display;
    if (effect.kind === 'setValue') {
      field.value =
        effect.value.type === 'text'
          ? effect.value.value
          : effect.value.type === 'toggle'
            ? effect.value.state
            : [...effect.value.values];
    }
  }
}

async function close(document: DocumentHandle | undefined): Promise<void> {
  if (document) await document.close();
}

describe('dynamic stamp real-PDF vertical slice', () => {
  it('extracts actions, executes, applies once, reopens, flattens and extracts', async () => {
    const bytes = new Uint8Array(await readFile(fixturePath));
    const engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
    let document: DocumentHandle | undefined;
    let reopened: DocumentHandle | undefined;
    let flattened: DocumentHandle | undefined;
    const sandbox = await createQuickJsSandbox();

    try {
      document = await engine.open(
        { kind: 'bytes', id: 'dynamic-stamp-acceptance', bytes },
        { scope: ['*'] },
      );
      const [snapshot, actions] = await Promise.all([
        document.forms.list(),
        document.actions!.read(),
      ]);
      const fields = scriptFieldsFromSnapshot(snapshot);
      const baseInput: Omit<ScriptInput, 'fields' | 'event'> = {
        document: {
          id: document.id,
          fileName: 'proposal.pdf',
          pageCount: 1,
          pageNumber: 0,
        },
        identity: {
          name: 'Alex Morgan',
          loginName: 'alex',
          corporation: 'EmbedPDF',
          email: 'alex@example.com',
        },
        environment: {
          nowMs: Date.UTC(2026, 6, 15, 9, 30, 0),
          utcOffsetMinutes: 180,
          randomSeed: 7,
        },
      };

      const bootSources = actions.nameTreeScripts.flatMap(({ action }) =>
        javaScriptProgramFromActionTree(action),
      );
      const boot = sandbox.boot(bootSources, {
        ...baseInput,
        fields,
        event: { kind: 'name-tree-boot' },
      });
      expect(boot.error).toBeUndefined();

      const effects: FormEffect[] = [...boot.formEffects];
      applyOverlay(fields, boot.formEffects);
      for (const ref of snapshot.calculationOrder) {
        if (!ref) continue;
        const field = snapshot.fields.find((candidate) => sameRef(candidate.ref, ref));
        const tree = field?.actions?.calculate;
        if (!field || !tree) continue;
        const current = fields.find((candidate) => sameRef(candidate.ref, ref));
        const output = sandbox.run(javaScriptProgramFromActionTree(tree), {
          ...baseInput,
          fields,
          event: { kind: 'field-calculate', target: ref, value: current?.value ?? null },
        });
        expect(output.error).toBeUndefined();
        effects.push(...output.formEffects);
        applyOverlay(fields, output.formEffects);
      }

      const events: string[] = [];
      const unsubscribe = document.events.subscribe((event) => events.push(event.type));
      const applied = await document.forms.applyEffects!(effects);
      unsubscribe();
      expect(applied.results.map(({ status }) => status)).toEqual([
        'applied',
        'applied',
        'applied',
        'applied',
      ]);
      expect(applied.meta).not.toBeNull();
      expect(events).toEqual(['form.effectsApplied']);

      const afterApply = await document.forms.list();
      expect(
        Object.fromEntries(afterApply.fields.map((field) => [field.name, field.valueEntry])),
      ).toEqual({
        approvedBy: { kind: 'scalar', value: 'Alex Morgan' },
        company: { kind: 'scalar', value: 'EmbedPDF' },
        stampDate: { kind: 'scalar', value: 'Jul 15, 2026' },
        documentName: { kind: 'scalar', value: 'proposal.pdf' },
      });

      const saved = await document.download({ mode: 'rewrite' });
      await close(document);
      document = undefined;
      reopened = await engine.open(
        { kind: 'bytes', id: 'dynamic-stamp-reopened', bytes: saved },
        { scope: ['*'] },
      );
      const reopenedValues = await reopened.forms.list();
      expect(reopenedValues.fields.map((field) => field.valueEntry)).toEqual(
        afterApply.fields.map((field) => field.valueEntry),
      );

      const page = (await reopened.pages.list()).pages[0];
      expect(reopened.pages.flatten).toBeDefined();
      const flattenedResult = await reopened.pages.flatten!([page.pageObjectNumber], 'display');
      expect(flattenedResult.results.map(({ status }) => status)).toEqual(['applied']);
      expect(reopened.pages.extract).toBeDefined();
      const extracted = await reopened.pages.extract!([page.pageObjectNumber]);

      flattened = await engine.open(
        { kind: 'bytes', id: 'dynamic-stamp-flattened', bytes: extracted },
        { scope: ['*'] },
      );
      const flattenedPage = (await flattened.pages.list()).pages[0];
      expect((await flattened.forms.list()).fields).toEqual([]);
      expect(
        (await flattened.page(flattenedPage.pageObjectNumber).annotations.list()).annotations,
      ).toEqual([]);
    } finally {
      sandbox.dispose();
      await close(flattened);
      await close(reopened);
      await close(document);
      await engine.destroy();
    }
  });
});
