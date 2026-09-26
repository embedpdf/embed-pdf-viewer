import { PluginError } from '@embedpdf/core';
import type {
  AnnotationFlags,
  AnnotationPropsPatch,
  Callout,
  ContentGeometry,
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
  /** An area redaction: `/Rect` is the removal region (ISO 32000-2), so it moves and resizes like a shape. */
  | { readonly subtype: 'redact'; readonly bounds: Rect }
  | { readonly subtype: 'free-text'; readonly bounds: Rect; readonly callout?: Callout };

const finite = (value: number): boolean => Number.isFinite(value);
const finitePoint = (point: Point): boolean => finite(point.x) && finite(point.y);

function invalid(message: string): PluginError {
  return new PluginError('invalid-input', 'annotation', message);
}

/** Page-space input → the core's content-space `ContentGeometry`. Validates finiteness and arity. */
export function geometryFromInput(input: CreateAnnotationInput): {
  subtype: Subtype;
  geometry: ContentGeometry;
} {
  switch (input.subtype) {
    case 'square':
    case 'circle': {
      const rect = input.bounds;
      if (
        ![rect.x, rect.y, rect.width, rect.height].every(finite) ||
        rect.width < 0 ||
        rect.height < 0
      ) {
        throw invalid('bounds must be a finite, non-negative rectangle');
      }
      return {
        subtype: input.subtype,
        geometry: {
          kind: 'rect',
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          ellipse: input.subtype === 'circle',
          ...(input.rotation ? { rot: input.rotation } : {}),
        },
      };
    }
    case 'line':
      if (!finitePoint(input.from) || !finitePoint(input.to))
        throw invalid('from and to must be finite points');
      return {
        subtype: 'line',
        geometry: { kind: 'line', a: { ...input.from }, b: { ...input.to } },
      };
    case 'polygon':
    case 'polyline': {
      const min = input.subtype === 'polygon' ? 3 : 2;
      if (input.vertices.length < min || !input.vertices.every(finitePoint)) {
        throw invalid(`${input.subtype} needs at least ${min} finite vertices`);
      }
      return {
        subtype: input.subtype,
        geometry: {
          kind: 'poly',
          points: input.vertices.map((point) => ({ ...point })),
          closed: input.subtype === 'polygon',
        },
      };
    }
    case 'ink': {
      const strokes = input.strokes.filter((stroke) => stroke.length >= 2);
      if (strokes.length === 0 || !strokes.every((stroke) => stroke.every(finitePoint))) {
        throw invalid('ink needs at least one stroke of two or more finite points');
      }
      return {
        subtype: 'ink',
        geometry: {
          kind: 'ink',
          strokes: strokes.map((stroke) => stroke.map((point) => ({ ...point }))),
        },
      };
    }
    case 'highlight':
    case 'underline':
    case 'strikeout':
    case 'squiggly':
    case 'redact': {
      if (!('quads' in input)) {
        const rect = input.bounds;
        if (
          ![rect.x, rect.y, rect.width, rect.height].every(finite) ||
          rect.width <= 0 ||
          rect.height <= 0
        ) {
          throw invalid('bounds must be a finite rectangle with positive size');
        }
        return {
          subtype: 'redact',
          geometry: {
            kind: 'rect',
            rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
            ellipse: false,
          },
        };
      }
      if (input.quads.length === 0) throw invalid(`${input.subtype} needs at least one quad`);
      return {
        subtype: input.subtype,
        geometry: { kind: 'quads', quads: input.quads.map((quad) => ({ ...quad })) },
      };
    }
    case 'free-text': {
      const rect = input.bounds;
      if (
        ![rect.x, rect.y, rect.width, rect.height].every(finite) ||
        rect.width <= 0 ||
        rect.height <= 0
      ) {
        throw invalid('bounds must be a finite rectangle with positive size');
      }
      return {
        subtype: 'free-text',
        geometry: {
          kind: 'text',
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
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
