/**
 * The attachment model: the document's attachments as the mirror holds
 * them, how an attachment and a page's file become one `AttachedFile`, and
 * the name a new file takes. Pure.
 */
import {
  annotationKey,
  type Annotation,
  type AnnotationRef,
  type Attachment,
  type AttachmentRef,
} from '@embedpdf/engine-core/runtime';

import type { AttachedFile } from './contract';

/** The session's part: the selected files, by id, in the order they were selected. */
export interface AttachmentModel {
  readonly selected: readonly string[];
}

export const initialAttachmentModel = (): AttachmentModel => ({ selected: [] });

/** Make these files the selection; the same ids leave the state as it is. */
export function selected(state: AttachmentModel, ids: readonly string[]): AttachmentModel {
  const unique = ids.filter((id, i) => ids.indexOf(id) === i);
  const same =
    unique.length === state.selected.length && unique.every((id, i) => id === state.selected[i]);
  return same ? state : { ...state, selected: unique };
}

/** The document's attachments, in the order its name tree keeps them; `null` before the first read lands. */
export type DocumentFiles = readonly Attachment[] | null;

/** An attachment's id: its key. */
export const documentFileId = (ref: AttachmentRef): string => `doc:${ref.key}`;

/** A page file's id: its annotation's key. */
export const pageFileId = (ref: AnnotationRef): string => `page:${annotationKey(ref)}`;

/** An attachment as the list shows it. */
export function documentFileOf(attachment: Attachment): AttachedFile {
  const { ref, index: _index, ...info } = attachment;
  return { ...info, id: documentFileId(ref), home: { kind: 'document', ref } };
}

/** A file attachment annotation's file as the list shows it; `null` for another kind, or one without a file. */
export function pageFileOf(annotation: Annotation): AttachedFile | null {
  if (annotation.subtype !== 'file-attachment' || !annotation.file) return null;
  return {
    ...annotation.file,
    id: pageFileId(annotation.ref),
    home: { kind: 'page', ref: annotation.ref },
  };
}

/**
 * `name`, or, when a file has it already, the name with the first number
 * that makes it free: `notes (2).txt`, then `notes (3).txt`. The number goes
 * before the extension, as a file manager puts it.
 */
export function freeName(name: string, taken: ReadonlySet<string>): string {
  if (!taken.has(name)) return name;
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : '';
  for (let number = 2; ; number++) {
    const candidate = `${stem} (${number})${extension}`;
    if (!taken.has(candidate)) return candidate;
  }
}
