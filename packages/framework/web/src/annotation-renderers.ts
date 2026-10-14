/**
 * The annotation layer's renderers: which drawing each annotation gets, and
 * the behaviors that `interactive` renderers register. A renderer is a rule
 * ("draw these annotations with this component"); a framework adapter keeps
 * the component, and these decide everything around it, the same for every
 * framework:
 *
 * - {@link registerRendererBehaviors}: an `interactive` renderer takes the
 *   pointer through a behavior the annotation plugin knows, registered once
 *   per capability and renderer entry however many pages mount the layer.
 * - {@link annotationDrawingOf}: per annotation, the layer's own drawing, a
 *   look of yours, or a sibling plugin's control (ownership beats looks).
 * - {@link editingTextKeyOf} and {@link layerTextBoxesOf}: which text box is
 *   typed in, and which text boxes the layer draws rather than a look.
 *
 * The plugin's types are mirrored structurally, so this package stays free of
 * EmbedPDF imports.
 */

/** A sibling plugin's renderer: it draws what the behavior `behavior` owns (the form plugin's controls). */
export interface BehaviorRendererEntry {
  behavior: string;
}

/** What an `interactive` function is asked: the annotation, and the active tool. */
export interface RendererInteractiveContext<Annotation> {
  annotation: Annotation;
  toolId: string;
}

/** A look of yours: draws the annotations `for` matches. */
export interface LookRendererEntry<Annotation> {
  /** A stable id for the registration (optional; generated). */
  id?: string;
  for(annotation: Annotation): boolean;
  /** Takes the pointer: always, or when the function says so (asked whenever it matters). */
  interactive?: boolean | ((context: RendererInteractiveContext<Annotation>) => boolean);
}

export type RendererEntry<Annotation> = BehaviorRendererEntry | LookRendererEntry<Annotation>;

const isLook = <Annotation>(
  renderer: RendererEntry<Annotation>,
): renderer is LookRendererEntry<Annotation> => 'for' in renderer;

/** The annotation plugin's behavior registry (its host capability satisfies it). */
export interface RendererBehaviorRegistry<Annotation> {
  registerBehavior(behavior: {
    id: string;
    matches(annotation: Annotation): boolean;
    engaged(annotation: Annotation): boolean;
  }): () => void;
  getBehaviorFor(annotation: Annotation): { id: string } | null;
}

interface RegisteredBehavior {
  id: string;
  count: number;
  unregister: () => void;
}

/**
 * The behaviors `interactive` renderers registered, counted per capability
 * and renderer entry, because the layer mounts once per page: the first page
 * registers, the last one unregisters. The entry's identity is the key, so a
 * renderer list must be defined once, never anew on every render.
 */
const registered = new WeakMap<object, Map<object, RegisteredBehavior>>();
let generatedIds = 0;

/**
 * Register a behavior for each `interactive` look in `renderers`, so the
 * plugin lets that renderer take the pointer. Call it when a layer mounts (and
 * again when its renderer list changes); call what it returns when it
 * unmounts. `activeToolId` is read whenever an `interactive` function is asked.
 */
export function registerRendererBehaviors<Annotation>(
  annotation: RendererBehaviorRegistry<Annotation>,
  renderers: readonly RendererEntry<Annotation>[],
  activeToolId: () => string,
): () => void {
  const releases: Array<() => void> = [];
  for (const renderer of renderers) {
    if (!isLook(renderer) || !renderer.interactive) continue;
    let perCapability = registered.get(annotation);
    if (!perCapability) registered.set(annotation, (perCapability = new Map()));
    let entry = perCapability.get(renderer);
    if (!entry) {
      const id = renderer.id ?? `renderer:${++generatedIds}`;
      const interactive = renderer.interactive;
      const engaged =
        typeof interactive === 'function'
          ? (record: Annotation) => interactive({ annotation: record, toolId: activeToolId() })
          : () => true;
      entry = {
        id,
        count: 0,
        unregister: annotation.registerBehavior({ id, matches: renderer.for, engaged }),
      };
      perCapability.set(renderer, entry);
    }
    entry.count++;
    const owned = entry;
    releases.push(() => {
      owned.count--;
      if (owned.count === 0) {
        owned.unregister();
        registered.get(annotation)?.delete(renderer);
      }
    });
  }
  return () => releases.forEach((release) => release());
}

/** The behavior id a renderer entry answers for: a sibling plugin's own, or the one registered for it. */
export function rendererBehaviorId<Annotation>(
  annotation: object,
  renderer: RendererEntry<Annotation>,
): string | null {
  if ('behavior' in renderer) return renderer.behavior;
  return registered.get(annotation)?.get(renderer)?.id ?? null;
}

/** The first of your looks that draws this annotation, or `null`. */
export function lookRendererFor<Annotation, Entry extends RendererEntry<Annotation>>(
  record: Annotation,
  renderers: readonly Entry[] | undefined,
): Extract<Entry, { for: unknown }> | null {
  const look = renderers?.find((renderer) => isLook<Annotation>(renderer) && renderer.for(record));
  return (look ?? null) as Extract<Entry, { for: unknown }> | null;
}

/**
 * How the layer draws one annotation:
 * - `native`: its own drawing (the scene or the engine's raster). `inert`
 *   when an engaged behavior's plugin owns the input with no renderer of
 *   yours (a link's anchor takes the click).
 * - `owned`: a sibling plugin's renderer draws it and takes the input (the
 *   form plugin's fill controls); it places its own controls.
 * - `look`: your renderer draws it, in the annotation's frame. `interactive`
 *   when an engaged behavior gave it the pointer; otherwise it only draws,
 *   and the frame is `inert` (no pointer, no focus) unless its text box is
 *   being typed in, where the renderer's editor takes the keys.
 */
export type AnnotationDrawing<Entry> =
  | { kind: 'native'; inert: boolean }
  | { kind: 'owned'; entry: Extract<Entry, { behavior: string }> }
  | { kind: 'look'; entry: Extract<Entry, { for: unknown }>; interactive: boolean; inert: boolean };

/**
 * The drawing an annotation gets. Ownership beats looks: an engaged
 * behavior's renderer is authoritative; `for` rules apply only to what the
 * layer owns, and draw without the pointer. `typing` is whether this
 * annotation's text box is being typed in.
 */
export function annotationDrawingOf<Annotation, Entry extends RendererEntry<Annotation>>(
  record: Annotation,
  annotation: RendererBehaviorRegistry<Annotation>,
  renderers: readonly Entry[] | undefined,
  typing: boolean,
): AnnotationDrawing<Entry> {
  const behavior = annotation.getBehaviorFor(record);
  if (behavior) {
    const entry = renderers?.find(
      (renderer) => rendererBehaviorId(annotation, renderer) === behavior.id,
    );
    if (entry && 'behavior' in entry) {
      return { kind: 'owned', entry: entry as Extract<Entry, { behavior: string }> };
    }
    if (entry) {
      return {
        kind: 'look',
        entry: entry as Extract<Entry, { for: unknown }>,
        interactive: true,
        inert: false,
      };
    }
    return { kind: 'native', inert: true };
  }
  const look = lookRendererFor<Annotation, Entry>(record, renderers);
  if (!look) return { kind: 'native', inert: false };
  return { kind: 'look', entry: look, interactive: false, inert: !typing };
}

// ── text boxes ───────────────────────────────────────────────────────────────

/**
 * The key of the text box being typed in (the one that is `editing` and has a
 * ref), or `null`. An annotation with this key is `typing` for
 * {@link annotationDrawingOf}: while it is, a look's own editor takes the keys.
 */
export function editingTextKeyOf<Ref>(
  texts: readonly { readonly editing: boolean; readonly ref: Ref | null }[],
  keyOf: (ref: Ref) => string,
): string | null {
  const editing = texts.find((text) => text.editing && text.ref !== null);
  return editing?.ref ? keyOf(editing.ref) : null;
}

/**
 * The text boxes the layer draws itself: all of them but the ones whose
 * annotation a look of yours draws, which that look edits with its own editor
 * (a renderer's rich text editor). `items` are the page's render items, which
 * carry each annotation; the same array comes back when there is no look.
 */
export function layerTextBoxesOf<Annotation, Ref, Text extends { readonly ref: Ref | null }>(
  texts: readonly Text[],
  items: readonly { readonly ref: Ref | null; readonly annotation?: Annotation | null }[],
  renderers: readonly RendererEntry<Annotation>[] | undefined,
  keyOf: (ref: Ref) => string,
): readonly Text[] {
  const looks = renderers?.filter((renderer) => isLook<Annotation>(renderer)) ?? [];
  if (looks.length === 0) return texts;
  const annotations = new Map<string, Annotation>();
  for (const item of items) {
    if (item.ref !== null && item.annotation) annotations.set(keyOf(item.ref), item.annotation);
  }
  return texts.filter((text) => {
    const annotation = text.ref !== null ? annotations.get(keyOf(text.ref)) : undefined;
    return !annotation || lookRendererFor(annotation, looks) === null;
  });
}
