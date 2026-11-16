/**
 * A page with a square and a text box, and the ink the fake engine answers a
 * create with: what the tests about a pen drawing that waits for its next
 * stroke run on.
 */
import type {
  AnnotationDraft,
  AnnotationFlags,
  AnnotationRef,
} from '@embedpdf/engine-core/runtime';

import type { AnnotationConfig } from '../../src/contract';
import {
  annotationHarness,
  PAGE,
  snapshotOf,
  type AnnotationHarness,
  type FileAnnotation,
} from '../harness';

const NO_FLAGS: AnnotationFlags = {
  invisible: false,
  hidden: false,
  print: true,
  noZoom: false,
  noRotate: false,
  noView: false,
  readOnly: false,
  locked: false,
  toggleNoView: false,
  lockedContents: false,
};

const ref = (objectNumber: number): AnnotationRef => ({
  kind: 'objectNumber',
  page: PAGE,
  objectNumber,
});

const base = (objectNumber: number) => ({
  ref: ref(objectNumber),
  page: PAGE,
  index: objectNumber,
  hasAppearance: true,
  appearanceState: null,
  nm: null,
  ...NO_FLAGS,
  contents: null,
  subject: null,
  author: null,
  createdAt: null,
  modifiedAt: null,
  blendMode: 'normal',
});

/** A filled square in the file's coordinates (y up): on the page, x 40..60, y 520..530. */
const square = (objectNumber: number): FileAnnotation =>
  ({
    ...base(objectNumber),
    subtype: 'square',
    rect: { left: 40, bottom: 270, right: 60, top: 280 },
    box: { left: 40, bottom: 270, right: 60, top: 280 },
    color: '#000000',
    strokeWidth: 1,
    opacity: 1,
    interiorColor: '#ff0000',
  }) as unknown as FileAnnotation;

/** A text box in the file's coordinates: on the page, x 100..300, y 60..100. */
const textBox = (objectNumber: number): FileAnnotation =>
  ({
    ...base(objectNumber),
    contents: 'hello',
    subtype: 'free-text',
    intent: 'free-text',
    fontFamily: 'helvetica',
    fontSize: 12,
    textAlign: 'left',
    color: '#000000',
    interiorColor: null,
    opacity: 1,
    strokeWidth: 1,
    borderStyle: 'solid',
    rect: { left: 100, bottom: 700, right: 300, top: 740 },
    box: { left: 100, bottom: 700, right: 300, top: 740 },
  }) as unknown as FileAnnotation;

/** The ink annotation the fake engine answers a create with. */
const ink = (objectNumber: number): FileAnnotation =>
  ({
    ...base(objectNumber),
    subtype: 'ink',
    inkList: [
      [
        { x: 300, y: 500 },
        { x: 340, y: 480 },
        { x: 380, y: 500 },
      ],
    ],
    rect: { left: 297, bottom: 477, right: 383, top: 503 },
    color: '#ef4444',
    strokeWidth: 6,
    opacity: 1,
  }) as unknown as FileAnnotation;

export const SQUARE = ref(20);
export const TEXT_BOX = ref(21);
/** A point on the square, in the text box, and on the empty page. */
export const ON_SQUARE = { x: 50, y: 525 };
export const IN_TEXT_BOX = { x: 200, y: 80 };
export const EMPTY = { x: 500, y: 700 };

/**
 * A document with the square and the text box, whose engine answers every
 * create with an ink. `wired` runs the plugin's `connect` too, on `interaction`
 * when one is given: its tools and pointer handlers are on the hub, and it
 * follows the hub's tool changes.
 */
export const inkDrawingHarness = async (
  config?: AnnotationConfig,
  { wired = false, interaction }: { wired?: boolean; interaction?: object } = {},
): Promise<AnnotationHarness> => {
  const harness = annotationHarness({ config, interaction });
  const records = [square(20), textBox(21)];
  if (wired) {
    // The plugin's `connect` starts the first load itself.
    harness.listAll.mockResolvedValueOnce(snapshotOf(records));
    harness.connectAll();
    await harness.capability.whenSynced();
  } else {
    await harness.load(records);
  }
  harness.create.mockImplementation(async () => ({ annotation: ink(40) }));
  return harness;
};

/** What the plugin sent the engine to create, of one kind. */
export const createsOf = <Subtype extends AnnotationDraft['subtype']>(
  harness: AnnotationHarness,
  subtype: Subtype,
): Extract<AnnotationDraft, { subtype: Subtype }>[] =>
  harness.applied
    .flatMap(({ change }) => ('ops' in change ? change.ops : []))
    .flatMap((op) =>
      op.type === 'annotations.create' && op.data.subtype === subtype
        ? [op.data as Extract<AnnotationDraft, { subtype: Subtype }>]
        : [],
    );

/** The strokes of every ink annotation the plugin sent the engine to create. */
export const inkCreates = (harness: AnnotationHarness): unknown[] =>
  createsOf(harness, 'ink').map((ink) => ink.inkList);
