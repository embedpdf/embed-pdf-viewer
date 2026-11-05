import type { AttachmentFileInfo } from '../../dto/Attachment';
import type { PdfAnnotationActions } from '../../dto/PdfAction';
import { actionTreeOf } from '../../dto/PdfLinkTarget';
import {
  DEFAULT_RICH_TEXT_BODY,
  type RichTextDocument,
  type RichTextDocumentInput,
} from '../../dto/RichText';
import type { Coordinates } from '../../pageSpace/coordinates';
import { kindFactsOf } from '../kind-facts';
import type { Annotation, AnnotationPatch } from '../kinds';

/**
 * A resolved patch's fields as a read spells them. Most fields read as they
 * are written; these take a different shape on the way in.
 */
export function readValueOf(name: string, value: unknown, current: unknown): unknown {
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
      // A read spells every rich color in lowercase, and keeps no empty run.
      return {
        body: { ...body, color: body.color.toLowerCase() },
        paragraphs: input.paragraphs.map((paragraph) => ({
          ...paragraph,
          runs: paragraph.runs
            .filter((run) => run.text !== '')
            .map((run) =>
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
      // the bytes say (size, MD5, dates) stays until new bytes come.
      return {
        ...(read ?? { sizeBytes: null, md5: null, createdAt: null, modifiedAt: null }),
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
 * `rect`, the modified date and author) keep
 * the value `current` has: the engine's answer brings the new one. A patch
 * that names a sibling kind makes it that kind, read as one: a field only the
 * new kind has reads `null`. Works in either space: it only moves values by
 * field name.
 */
export function applyResolvedPatch<A extends Annotation<Coordinates>>(
  current: A,
  resolved: AnnotationPatch<Coordinates>,
): A {
  const subtype = resolved.subtype ?? current.subtype;
  const owners = kindFactsOf(subtype)?.owners ?? {};
  const read = current as unknown as Record<string, unknown>;
  const next: Record<string, unknown> =
    subtype === current.subtype ? { ...read } : asKind(read, subtype, owners);
  for (const [name, value] of Object.entries(resolved)) {
    if (name === 'subtype' || value === undefined) continue;
    // Fields the engine owns, stamps or keeps as found are accepted and ignored.
    if (owners[name] !== 'data') continue;
    next[name] = readValueOf(name, value, read[name]);
  }
  return { ...next, ...followingReads(current, resolved) } as unknown as A;
}

/**
 * A read of one kind as a read of its sibling `subtype`: the fields that kind
 * declares, a field only it has `null` (as the engine reads an entry the file
 * doesn't have). The resolver has refused a value the new kind can't hold.
 */
function asKind(
  read: Record<string, unknown>,
  subtype: string,
  owners: Readonly<Record<string, string>>,
): Record<string, unknown> {
  const before = kindFactsOf(String(read.subtype))?.owners ?? {};
  const next: Record<string, unknown> = { subtype };
  for (const [name, value] of Object.entries(read)) {
    if (name !== 'subtype' && (name in owners || !(name in before))) next[name] = value;
  }
  for (const name of Object.keys(owners)) {
    if (!(name in before)) next[name] = null;
  }
  return next;
}

/**
 * Fields the engine keeps as found, but rewrites when a data field they
 * mirror changes: a link's `target` is the root of its `/A`, so a new target
 * is a new `actions.activate` (and no target, none).
 */
function followingReads(
  current: Annotation<Coordinates>,
  resolved: AnnotationPatch<Coordinates>,
): Record<string, unknown> {
  if (current.subtype !== 'link' || resolved.subtype !== 'link') return {};
  const target = resolved.target;
  // A target a write can't make moves no action: sent back unchanged it is
  // kept, and the engine refuses a changed one.
  if (target === undefined || (target !== null && target.kind !== 'uri' && target.kind !== 'goto'))
    return {};
  const { activate: _replaced, ...others } = current.actions ?? {};
  const actions: PdfAnnotationActions<unknown> =
    target === null ? others : { ...others, activate: actionTreeOf(target) };
  return { actions: Object.keys(actions).length > 0 ? actions : null };
}
