import { DEFAULT_RICH_TEXT_BODY, type RichTextDocument } from '../../dto/RichText';
import type { AnnotationRef } from '../../identity/AnnotationRef';
import type { Coordinates } from '../../pageSpace/coordinates';
import { annotationDefaultsOf } from '../defaults';
import { faceForFreeTextFont, type DescribeFont } from '../fontFaces';
import { declarationOf, type AnnotationDraft, type AnnotationDTO } from '../kinds';
import type { FreeTextFont } from '../primitives';
import { actionTreeOf, readValueOf } from './applyAnnotationPatch';

/** Who the engine stamps as creating an annotation, and when. */
export type DraftAttribution = Readonly<
  Partial<
    Record<'author' | 'userId' | 'createdBy' | 'modifiedBy' | 'createdAt' | 'modifiedAt', string>
  >
>;

/**
 * What a draft alone doesn't say about the annotation it creates: where it
 * will sit, who creates it, and what the engine works out from its drawing.
 */
export interface DraftContext<Box = unknown> {
  /** The ref it will have. A viewer names a create it's still waiting on by its `nm`. */
  readonly ref: AnnotationRef;
  /** Its place among its page's annotations: a create goes last. */
  readonly index: number;
  /** Who creates it and when, as the engine stamps it. Left out, a read says `null`. */
  readonly attribution?: DraftAttribution;
  /**
   * The upright box around what it draws, for a kind whose `rect` the engine
   * works out (a shape, a line, text markup). Left out: its `box`.
   */
  readonly rect?: Box;
  /** Looks up a registered font, for a free text in one. */
  readonly describeFont?: DescribeFont;
}

const NO_BOX = { x: 0, y: 0, width: 0, height: 0 };

/**
 * The rich body a free text's font, size, colors and alignment make: the
 * body its rich text takes when it states none.
 */
function bodyOfStyle(draft: Record<string, unknown>, describe?: DescribeFont) {
  const face = faceForFreeTextFont(draft.fontFamily as FreeTextFont, describe);
  const color = (draft.fontColor ?? draft.color ?? DEFAULT_RICH_TEXT_BODY.color) as string;
  return {
    ...DEFAULT_RICH_TEXT_BODY,
    family: face.family,
    ...(face.weight !== undefined ? { weight: face.weight } : {}),
    ...(face.italic !== undefined ? { italic: face.italic } : {}),
    size: draft.fontSize as number,
    color: color.toLowerCase(),
    align: draft.textAlign as RichTextDocument['body']['align'],
  };
}

/**
 * The annotation a resolved draft creates, as a read spells it: the draft's
 * data fields, the kind's defaults for those it leaves out, and what
 * `context` says for the fields the engine owns or stamps. Works in either
 * space: it only moves values by field name.
 */
export function annotationOfResolvedDraft<C extends Coordinates>(
  resolved: AnnotationDraft<C>,
  context: DraftContext,
): AnnotationDTO<C> {
  const subtype = resolved.subtype;
  const fields = declarationOf(subtype)?.fields ?? {};
  const defaults = annotationDefaultsOf(subtype);
  const given = resolved as unknown as Record<string, unknown>;
  const read: Record<string, unknown> = { subtype };
  for (const [name, field] of Object.entries(fields)) {
    const owner = (field as { traits: { owner: string } }).traits.owner;
    if (owner === 'data' && given[name] !== undefined) {
      read[name] = readValueOf(name, given[name], undefined);
    } else if (owner === 'data') {
      read[name] = defaults[name] ?? null;
    } else if (owner === 'attribution') {
      read[name] = context.attribution?.[name as keyof DraftAttribution] ?? null;
    } else {
      read[name] = null;
    }
  }
  read.ref = context.ref;
  read.page = context.ref.page;
  read.index = context.index;
  read.identityQuality = 'durable';
  if (read.rect === null) read.rect = context.rect ?? given.rect ?? given.box ?? NO_BOX;

  if (subtype === 'free-text') {
    const richText = given.richText as { body?: object } | undefined;
    if (richText && !richText.body) {
      read.richText = {
        ...(read.richText as RichTextDocument),
        body: bodyOfStyle(given, context.describeFont),
      };
    }
  }
  if (subtype === 'link') {
    const target = given.target as { kind: string } | null | undefined;
    read.actions =
      target && (target.kind === 'uri' || target.kind === 'goto')
        ? { activate: actionTreeOf(target as Parameters<typeof actionTreeOf>[0]) }
        : null;
  }
  if (subtype === 'widget') {
    // A widget created on its own belongs to no field until a form adopts it.
    read.fieldObjectNumber = 0;
    read.fieldFamily = 'unknown';
  }
  return read as unknown as AnnotationDTO<C>;
}
