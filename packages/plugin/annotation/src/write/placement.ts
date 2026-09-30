import type { FieldValues, KindName } from '@embedpdf/core-annotation';
import type {
  AnnotationDraft,
  AnnotationFlags,
  AnnotationResources,
  AttachmentFileSource,
  PageBox,
} from '@embedpdf/engine-core/runtime';

/**
 * Per-kind code for the click-to-place icon kinds (note / file attachment)
 * — the `props.ts` pattern: all tool config stays in the
 * tool table; this module only interprets it. The stamp keeps its own
 * sizing/sniffing path in the capability; everything funnels through the
 * one `placeAt` entry there.
 */

/**
 * Icon kinds place at their usual size: the icon fills its rect, so the
 * footprint ghost and the placement use exactly this size.
 */
export const ICON_PLACE_SIZE = { width: 20, height: 20 } as const;

export type IconPlaceKind = 'text' | 'file-attachment';

export const isIconPlaceKind = (subtype: KindName): subtype is IconPlaceKind =>
  subtype === 'text' || subtype === 'file-attachment';

/**
 * Build the engine create for a placed icon annotation: its data, and for a
 * file attachment the file's bytes as the `file` resource. `geometry` is the
 * icon's `rect`; `defaults` are the tool's (`defaultsFor`): its icon, colour
 * and opacity. What they leave out takes the engine's defaults.
 */
export function iconPlacement(
  subtype: IconPlaceKind,
  geometry: { rect: PageBox },
  defaults: FieldValues,
  flags: Partial<AnnotationFlags> | undefined,
  file: AttachmentFileSource | null,
): { data: AnnotationDraft; resources?: AnnotationResources } {
  // The tool's seed (the note/attachment tools pass noZoom + noRotate); a
  // new annotation prints by the engine's default.
  const shared = { ...defaults, ...geometry, ...flags };
  if (subtype === 'text') return { data: { ...shared, subtype: 'text' } as AnnotationDraft };
  if (!file) {
    throw new Error('[annotation] a file-attachment placement requires a file payload');
  }
  return {
    data: {
      ...shared,
      subtype: 'file-attachment',
      file: attachmentMetadataOf(file),
    } as AnnotationDraft,
    resources: { file: file.data instanceof ArrayBuffer ? new Uint8Array(file.data) : file.data },
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
