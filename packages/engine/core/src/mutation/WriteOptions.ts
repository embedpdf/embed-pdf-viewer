import type { FlattenOptions } from './PageFlattenResult';
import type { AnnotationResources } from '../annotation/resources';
import { EngineError } from '../errors/EngineError';
import { EngineErrorCode } from '../errors/EngineErrorCode';
import { generateUuid } from '../identity/uuid';

/**
 * What every write takes besides its data: how to write it, never what to
 * write.
 */
export interface WriteOptions {
  /**
   * Names this write. Every event it publishes carries the id as
   * `origin.tx.id`; on the cloud a retry with the same id returns the first
   * result and applies once. Minted when absent.
   */
  readonly opId?: string;
}

/** What an `opId` may be: what an HTTP header carries (`Idempotency-Key`). */
const OP_ID = /^[\x21-\x7e]{1,255}$/;

/**
 * The `opId` a write runs under: the caller's, or a fresh one. The caller's
 * must be 1 to 255 visible ASCII characters, on every engine; anything else
 * is refused with `InvalidArg`.
 */
export function opIdOf(options: WriteOptions | undefined): string {
  const opId = options?.opId;
  if (opId === undefined) return generateUuid();
  if (!OP_ID.test(opId)) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      'opId must be 1 to 255 visible ASCII characters',
      { details: { field: 'opId' } },
    );
  }
  return opId;
}

/** `page.annotations.create(data, options)`. */
export interface AnnotationCreateOptions extends WriteOptions {
  /**
   * Bytes beside the data, by role: a stamp's `appearance`, a file
   * attachment's `file`. A resource the kind doesn't take is refused.
   */
  readonly resources?: AnnotationResources;
  /**
   * The object number the annotation gets: one this document's
   * `objectNumbers` pool handed out. Without it the engine picks the next
   * free number, and the annotation's ref is known only from the result.
   */
  readonly objectNumber?: number;
}

/** `page.annotations.update(ref, patch, options)`. */
export interface AnnotationUpdateOptions extends WriteOptions {
  /** Replaces what it is for: a stamp's drawing, an attached file's bytes. */
  readonly resources?: AnnotationResources;
}

/** `page.annotations.flatten(refs, options)` and `pages.flatten(pages, options)`. */
export interface FlattenWriteOptions extends FlattenOptions, WriteOptions {}

/** `pages.insertBlank(spec, position, options)`. */
export interface PageInsertBlankOptions extends WriteOptions {
  /**
   * The object numbers the new pages get, in order, one per page: numbers
   * this document's `objectNumbers` pool handed out. Without them the engine
   * picks the next free numbers.
   */
  readonly objectNumbers?: readonly number[];
}

/** `forms.create(draft, options)`. */
export interface FormFieldCreateOptions extends WriteOptions {
  /** The object number the field gets, from this document's `objectNumbers` pool. */
  readonly objectNumber?: number;
  /** The object numbers its widgets get, in `draft.widgets` order, from the same pool. */
  readonly widgetObjectNumbers?: readonly number[];
}

/** `forms.addWidget(ref, placement, options)`. */
export interface FormWidgetAddOptions extends WriteOptions {
  /** The object number the new widget gets, from this document's `objectNumbers` pool. */
  readonly objectNumber?: number;
  /**
   * The object number the widget split off a merged field gets, when the
   * field is merged (a field and its only widget in one dictionary): the
   * field keeps its number, its widget moves to this one. Ignored for a
   * field that isn't merged.
   */
  readonly splitObjectNumber?: number;
}
