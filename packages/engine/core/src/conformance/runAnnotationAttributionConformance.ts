import type { ConformanceTestRunner } from './runMetadataConformance';
import type { AnnotationDTO, AnnotationDraft } from '../annotation/kinds';
import type { Identity } from '../auth/scope';
import type { DocumentHandle } from '../engine/DocumentHandle';
import type { Engine } from '../engine/Engine';
import type { PageHandle } from '../engine/PageHandle';
import { EngineErrorCode } from '../errors/EngineErrorCode';
import type { AnnotationRef } from '../identity/AnnotationRef';
import { annotationKey } from '../identity/annotationKey';

/** Who a session is and what it may do: open-time options locally, token claims on the cloud. */
export interface AttributionSession {
  readonly scope: ReadonlyArray<string>;
  readonly identity: Identity;
}

export interface AnnotationAttributionConformanceOptions {
  label: string;
  /** Build a fresh engine for this suite. The suite tears it down at the end. */
  makeEngine: () => Promise<Engine> | Engine;
  /**
   * Open the authoring document, a document with annotations another tool
   * wrote, as `session`. With `from`, the new session continues that open
   * session's document and sees what it wrote (locally its downloaded bytes,
   * on the cloud the same layer); the suite closes `from` afterwards.
   */
  openAs: (
    engine: Engine,
    session: AttributionSession,
    from?: DocumentHandle,
  ) => Promise<DocumentHandle>;
}

const SCOPE = ['doc.open', 'doc.render', 'doc.download', 'doc.annotate.modify'] as const;

const ALICE: Identity = {
  userId: 'alice',
  displayName: 'Alice Author',
  email: 'alice@example.com',
  title: 'Counsel',
  organization: 'Example Inc.',
  organizationalUnit: 'Legal',
  groupId: 'legal',
  groups: ['legal'],
};
const BOB: Identity = { userId: 'bob', displayName: 'Bob Builder', groupId: 'ops' };
/** A host's sync job, restoring annotations from its own store. */
const IMPORTER: Identity = { userId: 'sync-job', displayName: 'Sync Job', groupId: 'ops' };
/** What an export needs besides: reading the annotations. */
const READ = [...SCOPE, 'doc.annotate.read'] as const;

/** Attribution a caller has no business supplying on create or update. */
const FORGED = {
  author: 'Mallory',
  userId: 'mallory',
  createdBy: 'mallory',
  modifiedBy: 'mallory',
  createdAt: '2001-01-01T00:00:00.000Z',
  modifiedAt: '2001-01-01T00:00:00.000Z',
  importedBy: 'mallory',
};

const SQUARE: AnnotationDraft = {
  subtype: 'square',
  rect: { left: 40, bottom: 40, right: 140, top: 100 },
};

/**
 * Attribution on both engines with the same identities:
 * `create` stamps it from the session and ignores what the data says,
 * `update` stamps only `modifiedAt` and `modifiedBy`, and a `groupId` other than
 * the session's own passes the set-group check or is refused. The session's
 * whole identity reaches `doc.security.identity`; only the name and the ids
 * reach the annotation.
 */
export function runAnnotationAttributionConformance(
  runner: ConformanceTestRunner,
  opts: AnnotationAttributionConformanceOptions,
): void {
  const { describe, test, beforeAll, afterAll, expect } = runner;

  describe(`annotation attribution conformance: ${opts.label}`, () => {
    let engine: Engine;

    beforeAll(async () => {
      engine = await opts.makeEngine();
    });

    afterAll(async () => {
      if (engine) await engine.destroy();
    });

    /** Open the document as `session`, hand its first page to `run`, and close it. */
    const asSession = async <T>(
      session: AttributionSession,
      run: (page: PageHandle, doc: DocumentHandle) => Promise<T>,
    ): Promise<T> => {
      const doc = await opts.openAs(engine, session);
      try {
        return await run(await firstPage(doc), doc);
      } finally {
        await doc.close();
      }
    };

    /** A refusal from the permission check, whichever engine enforced it. */
    const expectRefused = async (write: () => Promise<unknown>, required: string) => {
      const error = await write().then(
        () => null,
        (caught: unknown) => caught,
      );
      expect(isPermissionRefusal(error)).toBe(true);
      expect(String((error as Error).message)).toContain(required);
    };

    test('the session identity is the one it was opened with', async () => {
      await asSession({ scope: SCOPE, identity: ALICE }, async (_page, doc) => {
        expect(doc.security.identity).toEqual(ALICE);
      });
    });

    test('create stamps attribution from the session and ignores the data', async () => {
      await asSession({ scope: SCOPE, identity: ALICE }, async (page) => {
        const before = Date.now();
        const { created } = await page.annotations.create({
          ...SQUARE,
          ...FORGED,
        } as AnnotationDraft);
        const after = Date.now();
        const read = await readBack(page, created.ref);
        expect(attributionOf(read)).toEqual({
          author: 'Alice Author',
          userId: 'alice',
          createdBy: 'alice',
          modifiedBy: 'alice',
          groupId: 'legal',
          importedBy: null,
        });
        expect(read.createdAt).toBe(read.modifiedAt);
        expectNow(read.createdAt, before, after);
        // The rest of the identity stays with the session.
        const text = JSON.stringify(read);
        for (const kept of [
          ALICE.email,
          ALICE.title,
          ALICE.organization,
          ALICE.organizationalUnit,
        ]) {
          expect(text.includes(kept!)).toBe(false);
        }
      });
    });

    test("update stamps modifiedAt and modifiedBy, and keeps the creator's attribution", async () => {
      const alice = await opts.openAs(engine, { scope: SCOPE, identity: ALICE });
      let original: AnnotationDTO;
      try {
        const page = await firstPage(alice);
        ({ created: original } = await page.annotations.create({
          ...SQUARE,
          nm: 'attribution-conformance-update',
        } as AnnotationDraft));
      } catch (error) {
        await alice.close();
        throw error;
      }
      const bob = await opts.openAs(engine, { scope: SCOPE, identity: BOB }, alice);
      await alice.close();
      try {
        const page = await firstPage(bob);
        const current = await findByNm(page, 'attribution-conformance-update');
        await page.annotations.update(current.ref, { contents: 'Checked', ...FORGED });
        const read = await readBack(page, current.ref);
        expect(attributionOf(read)).toEqual({
          author: 'Alice Author',
          userId: 'alice',
          createdBy: 'alice',
          modifiedBy: 'bob',
          groupId: 'legal',
          importedBy: null,
        });
        expect(read.createdAt).toBe(original.createdAt);
        expect(Date.parse(read.modifiedAt!) >= Date.parse(original.modifiedAt!)).toBe(true);
      } finally {
        await bob.close();
      }
    });

    test("update of another tool's annotation stamps only modifiedAt and modifiedBy", async () => {
      await asSession({ scope: SCOPE, identity: BOB }, async (page) => {
        const foreign = (await page.annotations.list()).annotations.find(
          (annotation) =>
            annotation.subtype !== 'popup' &&
            annotation.author !== null &&
            annotation.userId === null,
        );
        expect(foreign !== undefined).toBe(true);
        const before = Date.now();
        await page.annotations.update(foreign!.ref, { contents: 'Checked', ...FORGED });
        const after = Date.now();
        const read = await readBack(page, foreign!.ref);
        expect(attributionOf(read)).toEqual({
          author: foreign!.author,
          userId: null,
          createdBy: null,
          modifiedBy: 'bob',
          groupId: foreign!.groupId,
          importedBy: null,
        });
        expect(read.createdAt).toBe(foreign!.createdAt);
        expectNow(read.modifiedAt, before, after);
      });
    });

    test("create lands in the session's group unless it may set another", async () => {
      await asSession({ scope: SCOPE, identity: ALICE }, async (page) => {
        const own = await page.annotations.create({
          ...SQUARE,
          groupId: 'legal',
        } as AnnotationDraft);
        expect(own.created.groupId).toBe('legal');
        await expectRefused(
          () => page.annotations.create({ ...SQUARE, groupId: 'finance' } as AnnotationDraft),
          'set-group',
        );
      });
      const granted: AttributionSession = {
        scope: [...SCOPE, 'annotations:set-group:group=finance'],
        identity: ALICE,
      };
      await asSession(granted, async (page) => {
        const { created } = await page.annotations.create({
          ...SQUARE,
          groupId: 'finance',
        } as AnnotationDraft);
        expect(attributionOf(await readBack(page, created.ref))).toMatchObject({
          groupId: 'finance',
          userId: 'alice',
        });
      });
    });

    test('update reassigns a group only with authority for it', async () => {
      await asSession({ scope: SCOPE, identity: ALICE }, async (page) => {
        const { created } = await page.annotations.create(SQUARE);
        await expectRefused(
          () => page.annotations.update(created.ref, { groupId: 'finance' }),
          'set-group',
        );
        expect((await readBack(page, created.ref)).groupId).toBe('legal');
      });
      const granted: AttributionSession = {
        scope: [...SCOPE, 'annotations:set-group:group=finance'],
        identity: ALICE,
      };
      await asSession(granted, async (page) => {
        const { created } = await page.annotations.create(SQUARE);
        await page.annotations.update(created.ref, { groupId: 'finance' });
        expect((await readBack(page, created.ref)).groupId).toBe('finance');
      });
    });

    test('a restoring import keeps the attribution a bundle has, and records who imported it', async () => {
      // Alice writes, Bob edits one of hers: the bundle carries both, and the
      // annotations another tool wrote.
      const alice = await opts.openAs(engine, { scope: READ, identity: ALICE });
      const page = await firstPage(alice);
      const rect = { left: 300, bottom: 300, right: 330, top: 330 };
      const { created: square } = await page.annotations.create(SQUARE);
      const { created: note } = await page.annotations.create({ subtype: 'text', rect });
      await page.annotations.create({ subtype: 'text', rect, reply: { to: note.ref } });
      await page.annotations.create(
        { subtype: 'file-attachment', rect, file: { name: 'minutes.txt' } },
        { file: new TextEncoder().encode('minutes') },
      );
      const bob = await opts.openAs(engine, { scope: READ, identity: BOB }, alice);
      await alice.close();
      await (await firstPage(bob)).annotations.update(square.ref, { contents: 'Checked' });
      // Without names, so the copies land beside the originals.
      const exported = await bob.annotations.export();
      const bundle = {
        ...exported,
        items: exported.items.map((item) => ({ ...item, data: { ...item.data, nm: null } })),
      } as typeof exported;

      const importer = await opts.openAs(
        engine,
        { scope: [...READ, 'doc.annotate.import'], identity: IMPORTER },
        bob,
      );
      await bob.close();
      try {
        // Another tool's annotations carry an author but no EmbedPDF identity.
        expect(bundle.items.some(({ data }) => data.author !== null && data.userId === null)).toBe(
          true,
        );
        // 'restore' is the default.
        const result = await importer.annotations.import(bundle);
        expect(result.created).toHaveLength(bundle.items.length);
        result.created.forEach((created, index) => {
          const source = bundle.items[index]!.data;
          expect(attributionOf(created)).toEqual({
            ...attributionOf(source),
            importedBy: 'sync-job',
          });
          expect([created.createdAt, created.modifiedAt]).toEqual([
            source.createdAt,
            source.modifiedAt,
          ]);
          if (created.subtype === 'file-attachment' && source.subtype === 'file-attachment') {
            expect(created.file?.createdAt).toBe(source.file?.createdAt);
          }
        });
        const edited =
          result.created[
            bundle.items.findIndex(
              (item) => annotationKey(item.data.ref) === annotationKey(square.ref),
            )
          ]!;
        expect(attributionOf(edited)).toMatchObject({ userId: 'alice', modifiedBy: 'bob' });
      } finally {
        await importer.close();
      }
    });

    test('a restoring import needs doc.annotate.import; one that stamps does not', async () => {
      await asSession({ scope: READ, identity: ALICE }, async (page, doc) => {
        const { created } = await page.annotations.create(SQUARE);
        const bundle = await doc.annotations.export({ refs: [created.ref] });
        await expectRefused(() => doc.annotations.import(bundle), 'doc.annotate.import');
        const stamped = await doc.annotations.import(bundle, { attribution: 'stamp' });
        expect(attributionOf(stamped.created[0]!)).toMatchObject({
          userId: 'alice',
          importedBy: null,
        });
      });
    });

    test('doc.annotate.import is granted only by a scope that names it', async () => {
      await asSession({ scope: SCOPE, identity: ALICE }, async (_page, doc) => {
        expect(doc.security.allows('doc.annotate.import')).toBe(false);
      });
      await asSession(
        { scope: [...SCOPE, 'doc.annotate.import'], identity: ALICE },
        async (_page, doc) => {
          expect(doc.security.allows('doc.annotate.import')).toBe(true);
        },
      );
    });
  });
}

async function firstPage(doc: DocumentHandle): Promise<PageHandle> {
  const first = (await doc.annotations.listRawAll()).pages[0];
  if (!first) throw new Error('the authoring document has no pages');
  return doc.page(first.pageState.page);
}

async function readBack(page: PageHandle, ref: AnnotationRef): Promise<AnnotationDTO> {
  const found = (await page.annotations.list()).annotations.find(
    (annotation) => annotationKey(annotation.ref) === annotationKey(ref),
  );
  if (!found) throw new Error(`annotation ${annotationKey(ref)} is gone`);
  return found;
}

async function findByNm(page: PageHandle, nm: string): Promise<AnnotationDTO> {
  const found = (await page.annotations.list()).annotations.find(
    (annotation) => annotation.nm === nm,
  );
  if (!found) throw new Error(`no annotation named ${nm}`);
  return found;
}

function attributionOf(read: AnnotationDTO) {
  return {
    author: read.author,
    userId: read.userId,
    createdBy: read.createdBy,
    modifiedBy: read.modifiedBy,
    groupId: read.groupId,
    importedBy: read.importedBy,
  };
}

/** A PDF date keeps whole seconds, so "now" is the window around the write, widened to seconds. */
function expectNow(value: string | null, before: number, after: number): void {
  const at = value === null ? NaN : Date.parse(value);
  if (!(at >= Math.floor(before / 1000) * 1000 && at <= Math.ceil(after / 1000) * 1000)) {
    throw new Error(
      `expected a date between ${new Date(before).toISOString()} and ${new Date(after).toISOString()}, got ${value}`,
    );
  }
}

function isPermissionRefusal(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const { name, code } = error as { name?: unknown; code?: unknown };
  return name === 'PermissionDenied' || code === EngineErrorCode.Forbidden;
}
