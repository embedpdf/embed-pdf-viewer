import type { DocumentHandle } from '../engine/DocumentHandle';
import type { Engine } from '../engine/Engine';
import { DocumentActionsSnapshotSchema } from '../dto/PdfAction.schema';
import type { ConformanceFixture, ConformanceTestRunner } from './runMetadataConformance';

export interface ActionsConformanceFixtures {
  document: ConformanceFixture;
  page: ConformanceFixture;
  annotation: ConformanceFixture;
  field: ConformanceFixture;
}

export interface ActionsConformanceOptions {
  label: string;
  makeEngine: () => Promise<Engine> | Engine;
  fixtures: ActionsConformanceFixtures;
  openKind: 'bytes' | 'id';
}

/** Action extraction parity. These tests assert data only; no script executes. */
export function runActionsConformance(
  runner: ConformanceTestRunner,
  opts: ActionsConformanceOptions,
): void {
  const { describe, test, beforeAll, afterAll, expect } = runner;
  let engine: Engine;

  describe(`actions conformance: ${opts.label}`, () => {
    beforeAll(async () => {
      engine = await opts.makeEngine();
    });

    afterAll(async () => {
      if (engine) await engine.destroy();
    });

    test('reads catalog additional actions and preserves /CO identity', async () => {
      const doc = await open(engine, opts, opts.fixtures.document);
      try {
        expect(Boolean(doc.actions)).toBe(true);
        const snapshot = await doc.actions!.read();
        expect(DocumentActionsSnapshotSchema.safeParse(snapshot).success).toBe(true);
        expect(snapshot.openAction).toBeNull();
        expect(snapshot.willSave?.root?.type).toBe('javascript');
        expect(snapshot.willSave?.root?.script ?? '').toMatch(/Will Save/);
        expect(snapshot.didSave?.root?.script ?? '').toMatch(/Did Save/);
        expect(snapshot.willPrint?.root?.script ?? '').toMatch(/Will Print/);
        expect(snapshot.didPrint?.root?.script ?? '').toMatch(/Did Print/);

        const form = await doc.forms.list();
        expect(form.calculationOrder).toEqual([{ kind: 'objectNumber', fieldObjectNumber: 9 }]);
      } finally {
        await doc.close();
      }
    });

    test('attaches page /AA to PageLayout', async () => {
      const doc = await open(engine, opts, opts.fixtures.page);
      try {
        const pages = await doc.pages.list();
        expect(pages.pages[0].actions?.open?.root?.type).toBe('goto-embedded');
        expect(pages.pages[0].actions?.close).toBe(undefined);
        expect(pages.pages[1].actions?.open?.root?.type).toBe('goto-embedded');
        expect(pages.pages[1].actions?.close?.root?.type).toBe('goto-embedded');
      } finally {
        await doc.close();
      }
    });

    test('attaches activation actions to AnnotationBase, including links', async () => {
      const doc = await open(engine, opts, opts.fixtures.annotation);
      try {
        const firstPage = (await doc.pages.list()).pages[0];
        const snapshot = await doc.page(firstPage.pageObjectNumber).annotations.list();
        const button = snapshot.annotations.find(
          (annotation) =>
            annotation.ref.kind === 'objectNumber' && annotation.ref.annotObjectNumber === 7,
        );
        const link = snapshot.annotations.find(
          (annotation) =>
            annotation.ref.kind === 'objectNumber' && annotation.ref.annotObjectNumber === 8,
        );
        expect(button?.actions?.activate?.root?.type).toBe('uri');
        // A link carries BOTH planes: the base-level scripting action model
        // (chain shape, for the orchestrator) and its own normalized target
        // (payload, for navigation). They must agree on the action type.
        expect(link?.subtype).toBe('link');
        expect(link?.actions?.activate?.root?.type).toBe('uri');
        if (link?.subtype === 'link') {
          expect(link.target?.kind).toBe('uri');
        }
      } finally {
        await doc.close();
      }
    });

    test('keeps field actions separate from merged widget events', async () => {
      const doc = await open(engine, opts, opts.fixtures.field);
      try {
        const form = await doc.forms.list();
        expect(form.fields).toHaveLength(1);
        expect(form.fields[0].actions?.format?.root?.type).toBe('javascript');
        expect(form.fields[0].actions?.format?.root?.script ?? '').toMatch(/AFDate_FormatEx/);
        const page = (await doc.pages.list()).pages[0];
        const widget = (await doc.page(page.pageObjectNumber).annotations.list()).annotations[0];
        expect(widget.actions).toBe(undefined);
      } finally {
        await doc.close();
      }
    });
  });
}

async function open(
  engine: Engine,
  opts: ActionsConformanceOptions,
  fixture: ConformanceFixture,
): Promise<DocumentHandle> {
  if (opts.openKind === 'bytes') {
    return engine.open({ kind: 'bytes', id: fixture.id, bytes: await fixture.bytes() });
  }
  return engine.open({ kind: 'id', id: fixture.cloudId ?? fixture.id });
}
