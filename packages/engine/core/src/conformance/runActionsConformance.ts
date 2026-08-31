import type { DocumentHandle } from '../engine/DocumentHandle';
import type { Engine } from '../engine/Engine';
import type { PdfActionNode } from '../dto/PdfAction';
import { DocumentActionsSnapshotSchema } from '../dto/PdfAction.schema';
import type { ConformanceFixture, ConformanceTestRunner } from './runMetadataConformance';

/** The script payload rides only the javascript/rendition arms. */
function scriptOf(node: PdfActionNode | null | undefined): string {
  if (!node) return '';
  if (node.type === 'javascript') return node.script;
  if (node.type === 'rendition') return node.script ?? '';
  return '';
}

export interface ActionsConformanceFixtures {
  document: ConformanceFixture;
  page: ConformanceFixture;
  annotation: ConformanceFixture;
  field: ConformanceFixture;
  /** `action_payloads.pdf` — every executable payload shape on one page of
   *  /NM-keyed links. REQUIRED on both flavours: payload parity is a gate. */
  payloads: ConformanceFixture;
  /** `open_action_dest.pdf` — a destination-form catalog `/OpenAction`. */
  openDestination: ConformanceFixture;
  /** A page whose only annotation is a Link with a `/S /JavaScript` action.
   *  Optional: the javascript-link classification test skips without it. */
  javascriptLink?: ConformanceFixture;
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
        expect(scriptOf(snapshot.willSave?.root)).toMatch(/Will Save/);
        expect(scriptOf(snapshot.didSave?.root)).toMatch(/Did Save/);
        expect(scriptOf(snapshot.willPrint?.root)).toMatch(/Will Print/);
        expect(scriptOf(snapshot.didPrint?.root)).toMatch(/Did Print/);

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

    test('classifies a /S /JavaScript link target, script staying on base.actions', async () => {
      const fixture = opts.fixtures.javascriptLink;
      if (!fixture) return; // fixture not provided for this engine flavour
      const doc = await open(engine, opts, fixture);
      try {
        const firstPage = (await doc.pages.list()).pages[0];
        const snapshot = await doc.page(firstPage.pageObjectNumber).annotations.list();
        const link = snapshot.annotations.find((annotation) => annotation.subtype === 'link');
        expect(link?.subtype).toBe('link');
        if (link?.subtype === 'link') {
          // The navigation vocabulary classifies (FPDFAction_GetType alone
          // cannot — it has no JavaScript code)…
          expect(link.target).toEqual({ kind: 'javascript' });
        }
        // …while the script text lives ONLY on the scripting plane's model.
        expect(link?.actions?.activate?.root?.type).toBe('javascript');
        expect(scriptOf(link?.actions?.activate?.root)).toMatch(/app\.alert/);
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
        expect(scriptOf(form.fields[0].actions?.format?.root)).toMatch(/AFDate_FormatEx/);
        const page = (await doc.pages.list()).pages[0];
        const widget = (await doc.page(page.pageObjectNumber).annotations.list()).annotations[0];
        expect(widget.actions).toBe(undefined);
      } finally {
        await doc.close();
      }
    });

    test('carries interpreter payloads on every executable node', async () => {
      const doc = await open(engine, opts, opts.fixtures.payloads);
      try {
        const page = (await doc.pages.list()).pages[0];
        const snapshot = await doc.page(page.pageObjectNumber).annotations.list();
        const pon = page.pageObjectNumber;
        const rootOf = (nm: string) => {
          const annotation = snapshot.annotations.find((candidate) => candidate.nm === nm);
          expect(Boolean(annotation)).toBe(true);
          return annotation?.actions?.activate?.root ?? null;
        };
        const targetOf = (nm: string) => {
          const annotation = snapshot.annotations.find((candidate) => candidate.nm === nm);
          return annotation?.subtype === 'link' ? annotation.target : null;
        };

        expect(rootOf('goto-fitr')).toMatchObject({
          type: 'goto',
          destination: { kind: 'fitR', pageObjectNumber: pon, left: 10, bottom: 20, right: 300, top: 400 },
        });
        // Dual planes agree by construction: the target IS the tree's projection.
        expect(targetOf('goto-fitr')).toMatchObject({ kind: 'goto', destination: { kind: 'fitR' } });

        expect(rootOf('uri-map')).toMatchObject({
          type: 'uri',
          uri: 'https://example.test/map',
          isMap: true,
        });
        expect(rootOf('named-next')).toMatchObject({ type: 'named', name: 'NextPage' });

        const mixed = rootOf('hide-mixed');
        expect(mixed).toMatchObject({ type: 'hide', hide: false });
        const mixedTargets = mixed?.type === 'hide' ? mixed.targets : [];
        expect(mixedTargets).toHaveLength(2);
        expect(mixedTargets[0]).toEqual({ kind: 'name', name: 'note1' });
        expect(
          mixedTargets[1]?.kind === 'objectNumber' && mixedTargets[1].objectNumber > 0,
        ).toBe(true);
        expect(rootOf('hide-scalar')).toMatchObject({
          type: 'hide',
          targets: [{ kind: 'name', name: 'fieldB' }],
          hide: true,
        });

        // ResetForm's three states survive the wire distinctly.
        expect(rootOf('reset-include')).toMatchObject({
          type: 'reset-form',
          fields: [{ kind: 'name', name: 'calc1' }],
          exclude: true,
        });
        expect(rootOf('reset-absent')).toMatchObject({ type: 'reset-form', fields: null, exclude: true });
        expect(rootOf('reset-empty')).toMatchObject({ type: 'reset-form', fields: [], exclude: false });

        expect(rootOf('launch-app')).toMatchObject({ type: 'launch', filePath: 'app.exe' });
        expect(rootOf('gotor-file')).toMatchObject({ type: 'goto-remote', filePath: 'other.pdf' });

        // A mixed /Next chain carries every payload in PDF order.
        const chain = rootOf('chain-js-goto-hide');
        expect(chain).toMatchObject({ type: 'javascript', script: "app.alert('chain');" });
        expect(chain?.next[0]).toMatchObject({
          type: 'goto',
          destination: { kind: 'xyz', pageObjectNumber: pon, left: 5, top: 10, zoom: 1.25 },
        });
        expect(chain?.next[0]?.next[0]).toMatchObject({
          type: 'hide',
          targets: [{ kind: 'name', name: 'note1' }],
          hide: true,
        });
      } finally {
        await doc.close();
      }
    });

    test('degrades unreadable payloads to unknown with payload-dropped', async () => {
      const doc = await open(engine, opts, opts.fixtures.payloads);
      try {
        const page = (await doc.pages.list()).pages[0];
        const snapshot = await doc.page(page.pageObjectNumber).annotations.list();
        for (const [nm, subtype] of [
          ['goto-malformed', 'GoTo'],
          ['hide-partial', 'Hide'], // a partial target list must never half-execute
        ] as const) {
          const annotation = snapshot.annotations.find((candidate) => candidate.nm === nm);
          const tree = annotation?.actions?.activate;
          expect(tree?.root).toMatchObject({ type: 'unknown', subtype });
          expect(tree?.warnings ?? []).toContain('payload-dropped');
          // /A precedence, pinned: a broken action is a dead link — never a
          // silent /Dest fallback.
          if (annotation?.subtype === 'link') {
            expect(annotation.target).toEqual({ kind: 'unsupported' });
          }
        }
      } finally {
        await doc.close();
      }
    });

    test('reads a destination-form /OpenAction as openDestination', async () => {
      const doc = await open(engine, opts, opts.fixtures.openDestination);
      try {
        expect(Boolean(doc.actions)).toBe(true);
        const snapshot = await doc.actions!.read();
        expect(DocumentActionsSnapshotSchema.safeParse(snapshot).success).toBe(true);
        expect(snapshot.openAction).toBeNull();
        const pon = (await doc.pages.list()).pages[0].pageObjectNumber;
        expect(snapshot.openDestination).toEqual({
          kind: 'xyz',
          pageObjectNumber: pon,
          left: 10,
          top: 700,
          zoom: 1.5,
        });
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
