import {
  anchoredGeom,
  anchorModeOf,
  fitStampBox,
  toolAnnotation,
  unanchoredGeom,
  type BoxShape,
  type FieldValues,
  type KindName,
  type Model,
  type Point,
  type Rect,
  type ViewEnv,
} from '@embedpdf/core-annotation';
import type {
  AnnotationDraft,
  Annotation,
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
 * tool's ghost and the placement use exactly this size.
 */
export const ICON_PLACE_SIZE = { width: 20, height: 20 } as const;

export type IconPlaceKind = 'text' | 'file-attachment';

export const isIconPlaceKind = (subtype: KindName): subtype is IconPlaceKind =>
  subtype === 'text' || subtype === 'file-attachment';

/**
 * What a tool creates, read as an annotation before it has a shape: its
 * defaults and its `/F` seed. Its placement, its ghost and its commit all
 * start from it.
 */
export const annotationOfTool = (
  model: Model,
  tool: { subtype: KindName; preset: string; flags?: Partial<AnnotationFlags> },
): Annotation =>
  ({ ...toolAnnotation(model, tool.subtype, tool.preset), ...tool.flags }) as Annotation;

/**
 * Where an icon placed at `point` goes, at the view the user sees. An icon is
 * screen-anchored (`noZoom`, `noRotate`): it shows upright and at its usual
 * size, hanging from its rect's upper-left corner. So the placement starts
 * from how it shows, the icon centred on the pointer and kept on the page
 * (`shown`, what the ghost draws), and stores the rect whose own display is
 * exactly that (`rect`, through `unanchoredGeom`, the inverse gestures use).
 * `annotation` is what the tool creates, read for its flags. Without a view
 * the two are the same box.
 */
export function iconPlaceAt(
  annotation: Annotation,
  point: Point,
  page: { width: number; height: number },
  view: ViewEnv | undefined,
): { shown: BoxShape; rect: Rect } {
  const mode = anchorModeOf({ annotation });
  // How an icon at its usual size shows at this view: its size and its turn.
  const usual: BoxShape = {
    kind: 'box',
    box: { x: 0, y: 0, ...ICON_PLACE_SIZE },
    rotation: 0,
    ellipse: false,
  };
  const { box: size, rotation } = anchoredGeom(usual, mode, view) as BoxShape;
  const shown: BoxShape = {
    kind: 'box',
    box: fitStampBox(point, { width: size.width, height: size.height }, page, rotation),
    rotation,
    ellipse: false,
  };
  return { shown, rect: (unanchoredGeom(shown, mode, view) as BoxShape).box };
}

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
