/**
 * The types an app writes against when it draws annotations its own way: a renderer (which
 * annotations, with which component), the props that component gets, what the layer's `handle`
 * and `rotationHandle` snippets get, the props of the layer and the menus, and what
 * `useRichTextEditor()` and `useCommentThreads()` return.
 */
import type { Component, Snippet } from 'svelte';
import type { Attachment } from 'svelte/attachments';
import type {
  CreationDraftAnchor,
  Point,
  RenderItem,
  RotationAnchor,
} from '@embedpdf/core-annotation';
import type { Annotation, CommentThread, HandleRole } from '@embedpdf/plugin-annotation';
import type { AnchoredPlacement } from '@embedpdf/web';
import type { PageContextValue } from '../runtime/page';

/** The box a renderer draws into: the size to draw at, how it's turned, and how it's scaled. */
export interface AnnotationFrame {
  /** Its width in pixels at the annotation's 100% size, before its turn: draw at this. */
  width: number;
  /** Its height in pixels at the annotation's 100% size, before its turn: draw at this. */
  height: number;
  /**
   * How it's turned on screen, degrees clockwise: the page's turn and the annotation's own. 0 is
   * upright; turn your content by `-rotation` to keep it upright.
   */
  rotation: number;
  /**
   * How much the layer scales what you draw, with the page: the zoom, or for an annotation that
   * keeps its size on screen, the zoom up to 1.
   */
  scale: number;
}

/**
 * What a renderer's component gets as props: the annotation, the frame to draw into, and the
 * layer's own drawing of it to keep or wrap. The layer keeps handling the pointer (select, move,
 * resize) unless the renderer is `interactive`.
 */
export interface AnnotationRendererProps {
  /** The annotation, as `get()` returns it. */
  annotation: Annotation;
  /**
   * The box you draw into. The layer places, turns and scales it like the annotation's own
   * drawing, also during a drag, a resize or a turn. Fill it (`width: 100%; height: 100%`) and
   * draw at the annotation's 100% size: your text and borders scale with the page.
   */
  frame: AnnotationFrame;
  /** The layer's own drawing of it, filling the frame: `{@render native()}` keeps the original look, to add to it. */
  native: Snippet;
  /** The engine's picture of the annotation as an image (`url`), or `null`. `native` draws it in place. */
  appearance: { url: string } | null;
  /** True while the pointer is over it. */
  hovered: boolean;
  /** True while it's selected. */
  selected: boolean;
  /** True when what you draw takes the pointer (see `interactive` on the renderer). */
  interactive: boolean;
}

/**
 * What a sibling plugin's renderer gets for the annotations its behavior owns (the form plugin's
 * fill controls). It places its own controls: `item` is the layer's projection of the annotation
 * (its box, style, text and raster box, in page coordinates), and `page.transform.toPixels()`
 * turns those into the layer's pixels.
 */
export interface BehaviorRendererProps {
  annotation: Annotation;
  item: RenderItem;
  page: PageContextValue;
  /** The layer's own drawing of it, in its frame where the layer draws it: `{@render native()}`. */
  native: Snippet;
  hovered: boolean;
  selected: boolean;
  interactive: boolean;
}

/** What an `interactive` function is asked: the annotation, and the active tool. */
export interface AnnotationInteractiveContext {
  annotation: Annotation;
  toolId: string;
}

/**
 * One rule: "draw these annotations with this component". `for` gets the annotation with all its
 * fields; the first renderer that matches wins. Without `interactive` the component only draws:
 * the layer keeps handling the pointer. With `interactive` (or a function asked whenever it
 * matters) the component takes the pointer, and the annotation can't be selected or moved while
 * it does.
 *
 * Define the list once, in `<script>`: the layer registers each entry, and a list written inline
 * in the markup is a new one whenever the markup runs again.
 *
 * `{ behavior, component }` draws what a sibling plugin's behavior owns (the form plugin's fill
 * controls); the plugin decides when it's engaged.
 */
export type AnnotationRenderer =
  | { behavior: string; component: Component<BehaviorRendererProps> }
  | {
      /** A stable id for the registration (optional; generated). */
      id?: string;
      for: (annotation: Annotation) => boolean;
      component: Component<AnnotationRendererProps>;
      interactive?: boolean | ((context: AnnotationInteractiveContext) => boolean);
      /**
       * Scale what you draw with the page (the default): you draw at the annotation's 100% size.
       * `false`: you draw at its size on screen, and size things yourself from `frame.scale`.
       */
      scale?: boolean;
    };

/** What the layer's `handle` snippet gets: one handle to draw. */
export interface HandleProps {
  /** The handle's center, in pixels on the page. */
  at: Point;
  /** The `size` from the settings, px. */
  size: number;
  /** The selection's rotation (degrees clockwise), so a square handle can turn with it. */
  rotation: number;
  /** A box's `'corner'` or `'side'`, or one `'point'` of a line or a polygon. */
  kind: HandleRole;
  /** True while it's being dragged. */
  active: boolean;
}

/** What the layer's `rotationHandle` snippet gets: a handle's props, and where its stalk starts on the box. */
export interface RotationHandleProps extends Omit<HandleProps, 'kind'> {
  /** Where the stalk starts on the box, in pixels on the page. */
  from: Point;
}

export interface AnnotationLayerProps {
  /** Your own look for some annotations ({@link AnnotationRenderer}). Define the list once, in `<script>`. */
  renderers?: AnnotationRenderer[];
  /** Draw each handle yourself, in place of the layer's. The viewer still decides where it can be grabbed. */
  handle?: Snippet<[handle: HandleProps]>;
  /** Draw the rotation handle yourself, in place of the layer's. */
  rotationHandle?: Snippet<[handle: RotationHandleProps]>;
}

/** What `useRichTextEditor()` gives the element you draw a text box with. */
export interface RichTextEditor {
  /** Put it on your element (`{@attach editor.attach}`): it becomes the editor. Render nothing inside it. */
  readonly attach: Attachment<HTMLElement>;
  /** The box's body style as CSS (`style={editor.style}`): font, size, color and alignment. While typing it takes the pointer too. */
  readonly style: string;
  /** True while someone types in the box. */
  readonly editing: boolean;
}

/**
 * A {@link CommentThread} with where its page is shown now. Identity stays `page` (like every
 * annotation surface); these two fields are presentation, following page moves and deletes.
 */
export interface CommentThreadView extends CommentThread {
  /** Current 0-based display index of the thread's page; `-1` when the page is no longer in the document (for the one update before it goes). */
  pageIndex: number;
  /** The page's `/PageLabels` label when the PDF declares one ("iv", "A-2"), else the 1-based position as a string: print it as it is. */
  pageLabel: string;
}

export interface AnnotationMenuProps {
  /** The menu: buttons that call `useAnnotation()`, built from `useAnnotationState()`. */
  children: Snippet;
  /** The gap in screen pixels between the selection box and the menu. Default 15. */
  gap?: number;
  /** Where the menu sits next to the selection box. Default `'top'`. */
  placement?: AnchoredPlacement;
}

export interface AnnotationDraftMenuProps {
  /**
   * The menu, given the shape being drawn (`subtype`, `pointCount`, `minPoints`, `canFinish`, …).
   * The verbs are capability calls: `useAnnotation().draft.finish()` and `.draft.cancel()`.
   */
  children: Snippet<[draft: CreationDraftAnchor]>;
  /** The gap in screen pixels between the shape being drawn and the menu. Default 8. */
  gap?: number;
  /** Where the menu sits next to the shape being drawn. Default `'top'`. */
  placement?: AnchoredPlacement;
}

export interface AnnotationRotationBadgeProps {
  /**
   * The badge, given the rotation in progress (`angle`, degrees clockwise, as the commit will
   * apply it). Without it, the badge shows the angle in the `chrome.readout` colors, when
   * `chrome.readout.enabled`.
   */
  children?: Snippet<[rotation: RotationAnchor]>;
  /** The gap in screen pixels between the pointer and the badge. Default 16. */
  gap?: number;
  /** Where the badge sits next to the pointer. Default `'right'`. */
  placement?: AnchoredPlacement;
}
