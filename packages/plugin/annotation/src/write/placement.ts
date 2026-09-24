import type { AnnotationProps, Subtype } from '@embedpdf/core-annotation';
import type {
  AnnotationDraft,
  AnnotationFlags,
  AnnotationResources,
  AttachmentFileSource,
  FileAttachmentIcon,
  NoteIcon,
  PdfRect,
} from '@embedpdf/engine-core/runtime';

import { cssToColor } from '../repository';

/**
 * Per-kind code for the click-to-place icon kinds (note / file attachment)
 * — the `props.ts`/`repository.ts` pattern: all tool config stays in the
 * tool table; this module only interprets it. The stamp keeps its own
 * sizing/sniffing path in the capability; everything funnels through the
 * one `placeAt` entry there.
 */

/**
 * Icon kinds place at the generator's fixed box: the engine forces the
 * `/Rect` to 20×20 from its bottom-left corner (the spec's note-icon rule),
 * so the footprint ghost and the placement use exactly this size.
 */
export const ICON_PLACE_SIZE = { width: 20, height: 20 } as const;

export type IconPlaceKind = 'text' | 'file-attachment';

export const isIconPlaceKind = (subtype: Subtype): subtype is IconPlaceKind =>
  subtype === 'text' || subtype === 'file-attachment';

/**
 * Build the engine create for a placed icon annotation: its data, and for a
 * file attachment the file's bytes as the `file` resource. `geom` is the
 * repository's `boxGeomFields` emit (the `/Rect` + upright rotation pair);
 * `defaults` is the tool's resolved flat props bag (`defaultsFor`) — the
 * colour seam is crossed here via the repository's `cssToColor`, and the
 * icon falls back to the kind's own default when the bag carries none.
 */
export function iconPlacement(
  subtype: IconPlaceKind,
  geometry: { rect: PdfRect; rotation?: number | null; unrotatedRect?: PdfRect | null },
  defaults: AnnotationProps,
  flags: Partial<AnnotationFlags> | undefined,
  file: AttachmentFileSource | null,
): { data: AnnotationDraft; resources?: AnnotationResources } {
  const shared = {
    ...geometry,
    color: cssToColor(defaults.color),
    opacity: defaults.opacity,
    // A fresh placement carries print (Acrobat parity) plus the tool's seed
    // (the note/attachment tools pass noZoom + noRotate).
    print: true,
    ...flags,
  };
  if (subtype === 'text') {
    return { data: { subtype: 'text', icon: (defaults.icon as NoteIcon) ?? 'comment', ...shared } };
  }
  if (!file) {
    throw new Error('[annotation] a file-attachment placement requires a file payload');
  }
  return {
    data: {
      subtype: 'file-attachment',
      icon: (defaults.icon as FileAttachmentIcon) ?? 'paperclip',
      file: attachmentMetadataOf(file),
      ...shared,
    },
    resources: { file: file.data },
  };
}

/** A picked file's name, MIME type and description: from the source, else from a browser `File`. */
function attachmentMetadataOf(file: AttachmentFileSource): {
  name: string;
  mimeType?: string;
  description?: string;
} {
  const blob = typeof Blob !== 'undefined' && file.data instanceof Blob ? file.data : null;
  const name = file.name ?? (blob as File | null)?.name;
  if (!name) {
    throw new Error('[annotation] an attached file needs a name: pass { data, name } or a File');
  }
  const mimeType = file.mimeType ?? (blob?.type || undefined);
  return {
    name,
    ...(mimeType !== undefined ? { mimeType } : {}),
    ...(file.description !== undefined ? { description: file.description } : {}),
  };
}
