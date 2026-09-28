import type { AnnotationDraft } from '../annotation/kinds';
import type { AnnotationResources } from '../annotation/resources';
import type { PageBox } from '../geometry/pageSpace';

/** A 1×1 PNG, the smallest source a stamp accepts. */
export const PNG_1X1 = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  ),
  (character) => character.charCodeAt(0),
);

/** A create's two arguments. */
export interface Creatable {
  data: AnnotationDraft;
  resources?: AnnotationResources;
}

/** A note's or a file's icon at its usual 20 × 20, by its top-left corner. */
export function iconRect(x: number, y: number): PageBox {
  return { x, y, width: 20, height: 20 };
}

/** One create for every kind the engine can create, inside a box near the page's top-left. */
export function creatables(): Creatable[] {
  const rect: PageBox = { x: 40, y: 40, width: 100, height: 60 };
  const quad = {
    p1: { x: 40, y: 40 },
    p2: { x: 140, y: 40 },
    p3: { x: 40, y: 60 },
    p4: { x: 140, y: 60 },
  };
  const vertices = [
    { x: 50, y: 90 },
    { x: 130, y: 90 },
    { x: 90, y: 50 },
  ];
  const drafts: AnnotationDraft[] = [
    { subtype: 'highlight', quadPoints: [quad] },
    { subtype: 'underline', quadPoints: [quad] },
    { subtype: 'squiggly', quadPoints: [quad] },
    { subtype: 'strikeout', quadPoints: [quad] },
    { subtype: 'square', box: rect },
    // Rotation and a shape caption live in /EMBD_Metadata, which a plain annotation lacks.
    { subtype: 'square', box: { x: 60, y: 50, width: 60, height: 40 }, rotation: 30 },
    // Bumps and a callout's line reach past the box: `rect` holds them.
    { subtype: 'square', box: { x: 60, y: 50, width: 60, height: 40 }, cloudyIntensity: 1 },
    { subtype: 'circle', box: rect },
    { subtype: 'polygon', rect, vertices },
    { subtype: 'polygon', rect, vertices, captionEnabled: true, captionCenter: { x: 90, y: 80 } },
    { subtype: 'polyline', rect, vertices },
    { subtype: 'line', rect, linePoints: { start: { x: 50, y: 90 }, end: { x: 130, y: 50 } } },
    { subtype: 'ink', rect, inkList: [vertices] },
    {
      subtype: 'free-text',
      box: rect,
      intent: 'free-text',
      fontFamily: 'helvetica',
      fontSize: 12,
      textAlign: 'left',
      contents: 'Declaration conformance',
    },
    {
      subtype: 'free-text',
      box: { x: 80, y: 40, width: 60, height: 40 },
      intent: 'free-text-callout',
      fontFamily: 'helvetica',
      fontSize: 12,
      textAlign: 'left',
      contents: 'A callout',
      calloutLine: [
        { x: 45, y: 95 },
        { x: 60, y: 70 },
        { x: 80, y: 60 },
      ],
      lineEnding: 'open-arrow',
    },
    { subtype: 'caret', box: rect },
    { subtype: 'text', rect: iconRect(rect.x, rect.y) },
    { subtype: 'link', rect, target: { kind: 'uri', uri: 'https://example.com' } },
    { subtype: 'redact', rect, quadPoints: [quad] },
  ];
  return [
    ...drafts.map((data) => ({ data })),
    { data: { subtype: 'stamp', box: rect }, resources: { appearance: PNG_1X1 } },
    {
      data: {
        subtype: 'file-attachment',
        rect: iconRect(rect.x, rect.y),
        file: { name: 'note.txt', mimeType: 'text/plain', description: 'A note' },
      },
      resources: { file: new TextEncoder().encode('attached') },
    },
  ];
}
