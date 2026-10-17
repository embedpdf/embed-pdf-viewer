/**
 * The templates `<epdf-annotation-layer>` draws with, in place of React's `renderers` and
 * `components` props:
 *
 *   <epdf-annotation-layer>
 *     <ng-template [epdfAnnotation]="isNote" let-annotation let-frame="frame">…   your look
 *     <ng-template epdfHandle let-handle>…                                         your handles
 *     <ng-template epdfRotationHandle let-handle>…                                 your rotation handle
 *   </epdf-annotation-layer>
 *
 * A look (`epdfAnnotation`) is a renderer: which annotations it draws (a function of the
 * annotation, or a subtype such as `'stamp'`), whether it takes the pointer
 * (`epdfAnnotationInteractive`) and whether the layer scales it with the page
 * (`epdfAnnotationScale`). The first look that matches an annotation draws it.
 *
 * Which drawing each annotation gets, and the behaviors an interactive look registers, are
 * `@embedpdf/web`'s, keyed by the identity of each renderer entry. The page template, and with it
 * every template inside it, is made once per page on screen, so the entries here are interned:
 * the same rule (the same function or subtype, the same options) is the same entry on every
 * page, registered once.
 */
import {
  booleanAttribute,
  computed,
  Directive,
  inject,
  input,
  TemplateRef,
  type Signal,
} from '@angular/core';
import type { EpdfPageContext } from '@embedpdf/angular/runtime';
import type { Point, RenderItem } from '@embedpdf/core-annotation';
import type {
  Annotation,
  AnnotationRotationAnchor,
  AnnotationSubtype,
  HandleRole,
} from '@embedpdf/plugin-annotation';

// ── what the templates get ───────────────────────────────────────────────────

/** The box a look draws into: the size to draw at, how it's turned, and how it's scaled. */
export interface AnnotationFrame {
  /** Its width in pixels at the annotation's 100% size, before its turn: draw at this. */
  readonly width: number;
  /** Its height in pixels at the annotation's 100% size, before its turn: draw at this. */
  readonly height: number;
  /**
   * How it's turned on screen, degrees clockwise: the page's turn and the annotation's own. 0 is
   * upright; turn your content by `-rotation` to keep it upright.
   */
  readonly rotation: number;
  /**
   * How much the layer scales what you draw, with the page: the zoom, or for an annotation that
   * keeps its size on screen, the zoom up to 1.
   */
  readonly scale: number;
}

/** What an `epdfAnnotationInteractive` function is asked: the annotation, and the active tool. */
export interface AnnotationInteractiveContext {
  readonly annotation: Annotation;
  readonly toolId: string;
}

/**
 * What a look's template gets. `let-annotation` is the annotation; the rest are named:
 * `let-frame="frame"`, `let-hovered="hovered"`, `let-native="native"`.
 */
export interface EpdfAnnotationTemplateContext {
  /** The annotation, as `get()` returns it. */
  $implicit: Annotation;
  /** The same annotation, by name. */
  annotation: Annotation;
  /**
   * The box you draw into. The layer places, turns and scales it like the annotation's own
   * drawing, also during a drag, a resize or a turn. Fill it (`width: 100%; height: 100%`) and
   * draw at the annotation's 100% size: your text and borders scale with the page.
   */
  frame: AnnotationFrame;
  /**
   * The layer's own drawing of it, filling the frame: `<ng-container [ngTemplateOutlet]="native" />`
   * keeps the original look, to add to it.
   */
  native: TemplateRef<unknown>;
  /** The engine's picture of the annotation as an image (`url`), or `null`. `native` draws it in place. */
  appearance: { url: string } | null;
  /** True while the pointer is over it. */
  hovered: boolean;
  /** True while it's selected. */
  selected: boolean;
  /** True when what you draw takes the pointer (see `epdfAnnotationInteractive`). */
  interactive: boolean;
}

/**
 * What a sibling plugin's template gets for the annotations its behavior owns (a form plugin's
 * fill controls). It places its own controls: `item` is the layer's projection of the annotation
 * in page coordinates, and `page.transform().toPixels()` turns those into the layer's pixels.
 */
export interface EpdfAnnotationBehaviorTemplateContext {
  $implicit: Annotation;
  annotation: Annotation;
  item: RenderItem;
  page: EpdfPageContext;
  /** The layer's own drawing of it, in its frame where the layer draws it. */
  native: TemplateRef<unknown>;
  hovered: boolean;
  selected: boolean;
  interactive: boolean;
}

/** One handle to draw yourself (`let-handle` in `<ng-template epdfHandle>`). */
export interface HandleProps {
  /** The handle's center, in pixels on the page. */
  readonly at: Point;
  /** The `size` from the settings, px. */
  readonly size: number;
  /** The selection's rotation (degrees clockwise), so a square handle can turn with it. */
  readonly rotation: number;
  /** A box's `'corner'` or `'side'`, or one `'point'` of a line or a polygon. */
  readonly kind: HandleRole;
  /** True while it's being dragged. */
  readonly active: boolean;
}

/** The rotation handle to draw yourself: a handle's props, and where its stalk starts on the box. */
export interface RotationHandleProps extends Omit<HandleProps, 'kind'> {
  /** Where the stalk starts on the box, in pixels on the page. */
  readonly from: Point;
}

export interface EpdfHandleTemplateContext {
  $implicit: HandleProps;
}

export interface EpdfRotationHandleTemplateContext {
  $implicit: RotationHandleProps;
}

export interface EpdfRotationBadgeTemplateContext {
  /** The turn in progress: its `page`, the pointer's point `at`, and the `angle` so far. */
  $implicit: AnnotationRotationAnchor;
}

// ── the renderer entries ─────────────────────────────────────────────────────

/** Which annotations a look draws: a function of the annotation, or every one of a subtype. */
export type AnnotationMatch = ((annotation: Annotation) => boolean) | AnnotationSubtype;

/** Whether a look takes the pointer: always, never, or when the function says so. */
export type AnnotationInteractive = boolean | ((context: AnnotationInteractiveContext) => boolean);

/** A look as `@embedpdf/web` sees it: a renderer entry, the same object for the same rule. */
export interface AnnotationLookRenderer {
  readonly for: (annotation: Annotation) => boolean;
  readonly interactive: AnnotationInteractive;
  readonly scale: boolean;
}

/** A sibling plugin's renderer entry: it draws what the behavior `behavior` owns. */
export interface AnnotationBehaviorRenderer {
  readonly behavior: string;
}

export type AnnotationRendererEntry = AnnotationLookRenderer | AnnotationBehaviorRenderer;

const subtypeMatchers = new Map<string, (annotation: Annotation) => boolean>();
const ALWAYS = {};
const NEVER = {};
const SCALED = {};
const UNSCALED = {};
const looks = new WeakMap<object, WeakMap<object, WeakMap<object, AnnotationLookRenderer>>>();
const behaviors = new Map<string, AnnotationBehaviorRenderer>();

/** A table under `key` in `table`, made on first use. */
function tableIn<Value extends object>(
  table: WeakMap<object, Value>,
  key: object,
  make: () => Value,
): Value {
  let found = table.get(key);
  if (!found) table.set(key, (found = make()));
  return found;
}

/** The one entry for a look's rule: the same match, interactivity and scaling give the same object. */
function lookRendererOf(
  match: AnnotationMatch,
  interactive: AnnotationInteractive,
  scale: boolean,
): AnnotationLookRenderer {
  let matcher: (annotation: Annotation) => boolean;
  if (typeof match === 'function') {
    matcher = match;
  } else {
    matcher = subtypeMatchers.get(match) ?? ((annotation) => annotation.subtype === match);
    subtypeMatchers.set(match, matcher);
  }
  const interactiveKey = typeof interactive === 'function' ? interactive : interactive ? ALWAYS : NEVER;
  const byInteractive = tableIn(looks, matcher, () => new WeakMap());
  const byScale = tableIn(byInteractive, interactiveKey, () => new WeakMap());
  return tableIn(byScale, scale ? SCALED : UNSCALED, () =>
    Object.freeze({ for: matcher, interactive, scale }),
  );
}

/** `epdfAnnotationInteractive` with no value (`<ng-template … epdfAnnotationInteractive>`) is `true`. */
function interactiveAttribute(
  value: AnnotationInteractive | '' | 'true' | 'false' | null | undefined,
): AnnotationInteractive {
  if (typeof value === 'function') return value;
  return value === '' || value === true || value === 'true';
}

// ── the marker directives ────────────────────────────────────────────────────

/**
 * Your own look for some annotations: `<ng-template [epdfAnnotation]="isNote" let-annotation>`.
 * Give it a function that picks annotations by any field, or a subtype
 * (`epdfAnnotation="stamp"`). Without `epdfAnnotationInteractive` it only draws: the layer keeps
 * handling the pointer (select, move, resize). With it (or a function the layer asks whenever it
 * matters) your template takes the pointer, and the annotation can't be selected or moved while
 * it does. `[epdfAnnotationScale]="false"` draws at the size on screen instead of the
 * annotation's 100% size.
 */
@Directive({ selector: 'ng-template[epdfAnnotation]' })
export class EpdfAnnotationTemplate {
  /**
   * Which annotations it draws: a function of the annotation, or a subtype. (Not a required
   * input: a template inside `@if` is in the layer's query a moment before its inputs are set.)
   */
  readonly match = input<AnnotationMatch | undefined>(undefined, { alias: 'epdfAnnotation' });
  /** Whether it takes the pointer: present (or `true`), or a function of `{ annotation, toolId }`. */
  readonly interactive = input<
    AnnotationInteractive,
    AnnotationInteractive | '' | 'true' | 'false' | null | undefined
  >(false, { alias: 'epdfAnnotationInteractive', transform: interactiveAttribute });
  /** Scale what you draw with the page (the default), or draw at the size on screen (`false`). */
  readonly scale = input(true, { alias: 'epdfAnnotationScale', transform: booleanAttribute });

  readonly template = inject<TemplateRef<EpdfAnnotationTemplateContext>>(TemplateRef);
  /** Its renderer entry, the same object on every page for the same rule; null until it has one. */
  readonly renderer: Signal<AnnotationLookRenderer | null> = computed(() => {
    const match = this.match();
    return match ? lookRendererOf(match, this.interactive(), this.scale()) : null;
  });

  static ngTemplateContextGuard(
    _directive: EpdfAnnotationTemplate,
    context: unknown,
  ): context is EpdfAnnotationTemplateContext {
    return true;
  }
}

/**
 * What a sibling plugin's behavior owns, drawn by your template while the behavior is engaged:
 * `<ng-template epdfAnnotationBehavior="form-fill" let-annotation let-item="item">`. The
 * template places its own controls and takes the input.
 */
@Directive({ selector: 'ng-template[epdfAnnotationBehavior]' })
export class EpdfAnnotationBehaviorTemplate {
  /** The behavior's id, as its plugin registers it. */
  readonly behavior = input<string | undefined>(undefined, { alias: 'epdfAnnotationBehavior' });

  readonly template = inject<TemplateRef<EpdfAnnotationBehaviorTemplateContext>>(TemplateRef);
  /** Its renderer entry, the same object for the same behavior; null until it has one. */
  readonly renderer: Signal<AnnotationBehaviorRenderer | null> = computed(() => {
    const behavior = this.behavior();
    if (!behavior) return null;
    let entry = behaviors.get(behavior);
    if (!entry) behaviors.set(behavior, (entry = Object.freeze({ behavior })));
    return entry;
  });

  static ngTemplateContextGuard(
    _directive: EpdfAnnotationBehaviorTemplate,
    context: unknown,
  ): context is EpdfAnnotationBehaviorTemplateContext {
    return true;
  }
}

/**
 * Each handle, drawn your way in place of the layer's: `<ng-template epdfHandle let-handle>`.
 * The viewer still decides where a handle can be grabbed, so what you draw can't break dragging.
 */
@Directive({ selector: 'ng-template[epdfHandle]' })
export class EpdfHandleTemplate {
  readonly template = inject<TemplateRef<EpdfHandleTemplateContext>>(TemplateRef);

  static ngTemplateContextGuard(
    _directive: EpdfHandleTemplate,
    context: unknown,
  ): context is EpdfHandleTemplateContext {
    return true;
  }
}

/** The rotation handle, drawn your way: `<ng-template epdfRotationHandle let-handle>`. */
@Directive({ selector: 'ng-template[epdfRotationHandle]' })
export class EpdfRotationHandleTemplate {
  readonly template = inject<TemplateRef<EpdfRotationHandleTemplateContext>>(TemplateRef);

  static ngTemplateContextGuard(
    _directive: EpdfRotationHandleTemplate,
    context: unknown,
  ): context is EpdfRotationHandleTemplateContext {
    return true;
  }
}

/**
 * The rotation badge's content, drawn your way: inside `<epdf-annotation-rotation-badge>`,
 * `<ng-template epdfRotationBadge let-rotation>{{ rotation.angle }}°</ng-template>`.
 */
@Directive({ selector: 'ng-template[epdfRotationBadge]' })
export class EpdfRotationBadgeTemplate {
  readonly template = inject<TemplateRef<EpdfRotationBadgeTemplateContext>>(TemplateRef);

  static ngTemplateContextGuard(
    _directive: EpdfRotationBadgeTemplate,
    context: unknown,
  ): context is EpdfRotationBadgeTemplateContext {
    return true;
  }
}
