import { PluginError } from '@embedpdf/core';
import type {
  AnnotationFlags,
  AnnotationPropsPatch,
  Callout,
  Geom,
  Subtype,
} from '@embedpdf/core-annotation';
import type { Point, Rect, TextQuad } from '@embedpdf/core-geometry';
import type { AnnotationRef, PageRef } from '@embedpdf/engine-core/runtime';

/**
 * Page-space creation input — the data API's vocabulary. Geometry is in the
 * unrotated page's frame (origin at the CropBox top-left, y down, page units),
 * the same frame every pointer sample and selection quad uses. Tool defaults
 * apply first (`tool`, or the subtype's own preset), then `props`.
 */
export type CreateAnnotationInput = {
  readonly page: PageRef;
  /** An authoring tool id whose defaults, preset and `/F` seed apply (defaults to the subtype). */
  readonly tool?: string;
  /** Property overrides layered over the defaults (colour, opacity, stroke, font…). */
  readonly props?: AnnotationPropsPatch;
  /** `/F` seed merged over the drawn defaults. */
  readonly flags?: Partial<AnnotationFlags>;
  /** Select the new annotation once staged, as a tool would. Default false. */
  readonly select?: boolean;
} & CreateAnnotationGeometry;

export type CreateAnnotationGeometry =
  | { readonly subtype: 'square' | 'circle'; readonly bounds: Rect; readonly rotation?: number }
  | { readonly subtype: 'line'; readonly from: Point; readonly to: Point }
  | { readonly subtype: 'polygon' | 'polyline'; readonly vertices: readonly Point[] }
  | { readonly subtype: 'ink'; readonly strokes: readonly (readonly Point[])[] }
  | {
      readonly subtype: 'highlight' | 'underline' | 'strikeout' | 'squiggly' | 'redact';
      readonly quads: readonly TextQuad[];
    }
  /** An AREA redaction: `/Rect` IS the removal region (ISO 32000-2), so it moves and resizes like a shape. */
  | { readonly subtype: 'redact'; readonly bounds: Rect }
  | { readonly subtype: 'free-text'; readonly bounds: Rect; readonly callout?: Callout };

const finite = (value: number): boolean => Number.isFinite(value);
const finitePoint = (p: Point): boolean => finite(p.x) && finite(p.y);

function invalid(message: string): PluginError {
  return new PluginError('invalid-input', 'annotation', message);
}

/** Page-space input → the core's content-space `Geom`. Validates finiteness and arity. */
export function geometryFromInput(input: CreateAnnotationInput): { subtype: Subtype; geom: Geom } {
  switch (input.subtype) {
    case 'square':
    case 'circle': {
      const r = input.bounds;
      if (![r.x, r.y, r.width, r.height].every(finite) || r.width < 0 || r.height < 0) {
        throw invalid('bounds must be a finite, non-negative rectangle');
      }
      return {
        subtype: input.subtype,
        geom: {
          t: 'rect',
          rect: { x: r.x, y: r.y, width: r.width, height: r.height },
          ellipse: input.subtype === 'circle',
          ...(input.rotation ? { rot: input.rotation } : {}),
        },
      };
    }
    case 'line':
      if (!finitePoint(input.from) || !finitePoint(input.to))
        throw invalid('from and to must be finite points');
      return { subtype: 'line', geom: { t: 'line', a: { ...input.from }, b: { ...input.to } } };
    case 'polygon':
    case 'polyline': {
      const min = input.subtype === 'polygon' ? 3 : 2;
      if (input.vertices.length < min || !input.vertices.every(finitePoint)) {
        throw invalid(`${input.subtype} needs at least ${min} finite vertices`);
      }
      return {
        subtype: input.subtype,
        geom: {
          t: 'poly',
          points: input.vertices.map((v) => ({ ...v })),
          closed: input.subtype === 'polygon',
        },
      };
    }
    case 'ink': {
      const strokes = input.strokes.filter((s) => s.length >= 2);
      if (strokes.length === 0 || !strokes.every((s) => s.every(finitePoint))) {
        throw invalid('ink needs at least one stroke of two or more finite points');
      }
      return {
        subtype: 'ink',
        geom: { t: 'ink', strokes: strokes.map((s) => s.map((p) => ({ ...p }))) },
      };
    }
    case 'highlight':
    case 'underline':
    case 'strikeout':
    case 'squiggly':
    case 'redact': {
      if (!('quads' in input)) {
        const r = input.bounds;
        if (![r.x, r.y, r.width, r.height].every(finite) || r.width <= 0 || r.height <= 0) {
          throw invalid('bounds must be a finite rectangle with positive size');
        }
        return {
          subtype: 'redact',
          geom: {
            t: 'rect',
            rect: { x: r.x, y: r.y, width: r.width, height: r.height },
            ellipse: false,
          },
        };
      }
      if (input.quads.length === 0) throw invalid(`${input.subtype} needs at least one quad`);
      return {
        subtype: input.subtype,
        geom: { t: 'quads', quads: input.quads.map((q) => ({ ...q })) },
      };
    }
    case 'free-text': {
      const r = input.bounds;
      if (![r.x, r.y, r.width, r.height].every(finite) || r.width <= 0 || r.height <= 0) {
        throw invalid('bounds must be a finite rectangle with positive size');
      }
      return {
        subtype: 'free-text',
        geom: {
          t: 'text',
          rect: { x: r.x, y: r.y, width: r.width, height: r.height },
          ...(input.callout ? { callout: input.callout } : {}),
        },
      };
    }
    default: {
      const subtype = (input as { subtype: string }).subtype;
      throw new PluginError(
        'unsupported',
        'annotation',
        `create() does not build '${subtype}' annotations yet; use createRaw(), placeStamp() or createAttachment()`,
      );
    }
  }
}

export type { AnnotationRef };
