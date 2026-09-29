import type { AttachmentFileInfo } from '../../dto/Attachment';
import type { PdfActionNode, PdfActionTree, PdfAnnotationActions } from '../../dto/PdfAction';
import {
  DEFAULT_RICH_TEXT_BODY,
  type RichTextDocument,
  type RichTextDocumentInput,
} from '../../dto/RichText';
import type { Coordinates } from '../../pageSpace/coordinates';
import type { KindFields } from '../declaration';
import { declarationOf, type AnnotationDTO, type AnnotationPatch } from '../kinds';

/**
 * A resolved patch's fields as a read spells them. Most fields read as they
 * are written; these take a different shape on the way in.
 */
function readValueOf(name: string, value: unknown, current: unknown): unknown {
  if (value === null) return null;
  switch (name) {
    case 'reply': {
      const reply = value as { to: unknown; type?: 'reply' | 'group' };
      return { to: reply.to, type: reply.type ?? 'reply' };
    }
    case 'richText': {
      const input = value as RichTextDocumentInput;
      const read = current as RichTextDocument | undefined;
      const body = input.body
        ? { ...DEFAULT_RICH_TEXT_BODY, ...input.body }
        : (read?.body ?? DEFAULT_RICH_TEXT_BODY);
      // A read spells every rich color in lowercase.
      return {
        body: { ...body, color: body.color.toLowerCase() },
        paragraphs: input.paragraphs.map((paragraph) => ({
          ...paragraph,
          runs: paragraph.runs.map((run) =>
            run.style?.color
              ? { ...run, style: { ...run.style, color: run.style.color.toLowerCase() } }
              : run,
          ),
        })),
      } satisfies RichTextDocument;
    }
    case 'file': {
      const written = value as {
        name: string;
        mimeType?: string | null;
        description?: string | null;
      };
      const read = current as AttachmentFileInfo | null;
      // The name, type and description are one value, replaced whole; what
      // the bytes say (size, checksum, dates) stays until new bytes come.
      return {
        ...(read ?? { size: null, checksum: null, createdAt: null, modifiedAt: null }),
        name: written.name,
        mimeType: written.mimeType ?? null,
        description: written.description ?? null,
      } satisfies AttachmentFileInfo;
    }
    default:
      return value;
  }
}

/**
 * `current` with a resolved patch's data fields in place, each as a read
 * spells it. Fields the engine works out or stamps itself (a drawn kind's
 * `rect`, the modified date and author, a weak annotation's new name) keep
 * the value `current` has: the engine's answer brings the new one. Works in
 * either space: it only moves values by field name.
 */
export function applyResolvedPatch<A extends AnnotationDTO<Coordinates>>(
  current: A,
  resolved: AnnotationPatch<Coordinates>,
): A {
  const fields: KindFields = declarationOf(current.subtype)?.fields ?? {};
  const read = current as unknown as Record<string, unknown>;
  const next: Record<string, unknown> = { ...read };
  for (const [name, value] of Object.entries(resolved)) {
    if (name === 'subtype' || value === undefined) continue;
    // Fields the engine owns, stamps or keeps as found are accepted and ignored.
    if (fields[name]?.traits.owner !== 'data') continue;
    next[name] = readValueOf(name, value, read[name]);
  }
  return { ...next, ...followingReads(current, resolved) } as unknown as A;
}

/**
 * Fields the engine keeps as found, but rewrites when a data field they
 * mirror changes: a link's `target` is the root of its `/A`, so a new target
 * is a new `actions.activate` (and no target, none).
 */
function followingReads(
  current: AnnotationDTO<Coordinates>,
  resolved: AnnotationPatch<Coordinates>,
): Record<string, unknown> {
  if (current.subtype !== 'link' || resolved.subtype !== 'link') return {};
  const target = resolved.target;
  // A read-only target reached here only sent back unchanged: nothing moves.
  if (target === undefined || (target !== null && target.kind !== 'uri' && target.kind !== 'goto'))
    return {};
  const { activate: _replaced, ...others } = current.actions ?? {};
  const actions: PdfAnnotationActions<unknown> =
    target === null ? others : { ...others, activate: actionTreeOf(target) };
  return { actions: Object.keys(actions).length > 0 ? actions : null };
}

/** The action tree the engine writes for a link target: one URI or GoTo action. */
function actionTreeOf(
  target: { kind: 'uri'; uri: string } | { kind: 'goto'; destination: unknown },
): PdfActionTree<unknown> {
  const root: PdfActionNode<unknown> =
    target.kind === 'uri'
      ? { type: 'uri', subtype: 'URI', uri: target.uri, isMap: false, next: [] }
      : { type: 'goto', subtype: 'GoTo', destination: target.destination, next: [] };
  return { root, incomplete: false, warningFlags: 0, warnings: [] };
}
