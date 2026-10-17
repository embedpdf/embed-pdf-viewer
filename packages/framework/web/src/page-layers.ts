/**
 * Which parts of a page the layers on it paint themselves. The annotation
 * layer paints the annotations, the form layer the form fields; while one is
 * on the page it says so here, and the page's picture (the render layer)
 * leaves that part out, so nothing is drawn twice and nobody passes a flag.
 *
 * Kept per page surface, by the page ref it hands its layers (`page.ref`):
 * each surface makes its own, and keeps it while it shows the page, through
 * zooms. Changes reach subscribers a microtask later, so a layer may say what
 * it paints from any point in its framework's lifecycle (React's insertion
 * effects included, which must not start updates); `painted()` is current at
 * once.
 */

/** A part of a page a layer can paint instead of the page's picture. */
export type PagePart = 'annotations' | 'formFields';

/** Which parts the layers on one page paint. */
export interface PaintedParts {
  readonly annotations: boolean;
  readonly formFields: boolean;
}

/** One page's layers: which parts they paint. */
export interface PageLayers {
  /** Say this layer paints `part`, until the function it returns is called. */
  paint(part: PagePart): () => void;
  /** Which parts are painted now: the same object for the same answer. */
  painted(): PaintedParts;
  /** Hear when `painted()` changes. Returns the unsubscribe. */
  subscribe(listener: () => void): () => void;
}

/** Every answer `painted()` gives, one object each, so the same answer is the same object. */
const ANSWERS: readonly (readonly PaintedParts[])[] = [false, true].map((annotations) =>
  [false, true].map((formFields) => Object.freeze({ annotations, formFields })),
);

const pages = new WeakMap<object, PageLayers>();

/** The layers of one page surface, by the page ref it hands its layers. */
export function pageLayersOf(pageRef: object): PageLayers {
  let layers = pages.get(pageRef);
  if (!layers) {
    layers = createPageLayers();
    pages.set(pageRef, layers);
  }
  return layers;
}

function createPageLayers(): PageLayers {
  const painters: Record<PagePart, number> = { annotations: 0, formFields: 0 };
  const listeners = new Set<() => void>();
  let painted = ANSWERS[0]![0]!;
  let notifying = false;

  const update = () => {
    const next = ANSWERS[painters.annotations > 0 ? 1 : 0]![painters.formFields > 0 ? 1 : 0]!;
    if (next === painted) return;
    painted = next;
    if (notifying) return;
    notifying = true;
    queueMicrotask(() => {
      notifying = false;
      listeners.forEach((listener) => listener());
    });
  };

  return {
    paint(part) {
      painters[part] += 1;
      update();
      let released = false;
      return () => {
        if (released) return;
        released = true;
        painters[part] -= 1;
        update();
      };
    },
    painted: () => painted,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** The parts a render layer was told to draw (`true`) or leave out (`false`). */
export interface PicturePartProps {
  readonly annotations?: boolean;
  readonly formFields?: boolean;
}

/** What the user may read of each part (the render plugin's `getLayerRights()`). */
export interface PartRights {
  readonly annotations: boolean;
  readonly formFields: boolean;
}

/** The picture's layer options, as the render plugin takes them. */
export interface PictureLayerOptions {
  includeAnnotations: boolean;
  includeFormFields: boolean;
}

/**
 * What the page's picture draws, as the render plugin's layer options: a part
 * the props name is drawn or left out as they say; any other part is drawn
 * when no layer on the page paints it and the user may read it. Both are
 * always given, so a picture that leaves the annotations to a layer still
 * draws the form fields.
 */
export function pictureLayerOptionsOf(
  painted: PaintedParts,
  props: PicturePartProps,
  may: PartRights,
): PictureLayerOptions {
  return {
    includeAnnotations: props.annotations ?? (!painted.annotations && may.annotations),
    includeFormFields: props.formFields ?? (!painted.formFields && may.formFields),
  };
}

/**
 * The parts a picture draws that a layer on the page paints too, because the
 * props asked for them: drawn twice.
 */
export function partsDrawnTwice(painted: PaintedParts, props: PicturePartProps): PagePart[] {
  const twice: PagePart[] = [];
  if (props.annotations === true && painted.annotations) twice.push('annotations');
  if (props.formFields === true && painted.formFields) twice.push('formFields');
  return twice;
}
