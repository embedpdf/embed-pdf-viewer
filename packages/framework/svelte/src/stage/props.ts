/** The props of the Stage's components: `<Stage>` and `<Scrollbar>`. */
import type { Snippet } from 'svelte';
import type { PageContextValue } from '../runtime/page';
import type { StageTokenProp } from './stage-scope';

export interface StageProps {
  /**
   * Page-space content for each visible page (`<RenderLayer>`, annotations, markers): what you
   * write between `<Stage>` and `</Stage>`, or `{#snippet children(page)}` when it needs the page.
   * It's drawn inside the page's content frame, so it turns with the page, and positions are PDF
   * points.
   */
  children: Snippet<[page: PageContextValue]>;
  /**
   * Box-space chrome for each visible page (a page number, a selection border, a per-page
   * button), drawn into the outer box (content and the reserved `pageFrame`). It never turns,
   * and the reserved bands are plain regions: `bottom: 0; height: page.frame.bottom`.
   */
  pageChrome?: Snippet<[page: PageContextValue]>;
  /** Viewport-space UI (menus, controls, `<Scrollbar>`), drawn above the pages. */
  overlay?: Snippet;
  /**
   * The active tool, two-way (`bind:tool`): while it's set, the interaction plugin's active tool
   * follows it, and a tool chosen elsewhere is written back. Leave it out for the default
   * (`useInteraction().activateTool()`).
   */
  tool?: string;
  /** Called on every tool change of this stage's document. */
  onToolChange?: (toolId: string) => void;
  /**
   * The current page's index, from 0, two-way (`bind:page`): the Stage writes it as the reader
   * moves, and goes to the page when you change it.
   */
  page?: number;
  /**
   * The zoom level, two-way (`bind:zoom`): `1` is 100%. The Stage writes it as the zoom changes,
   * and zooms to it when you change it.
   */
  zoom?: number;
  /** The stage lens to drive: the nearest `<StageScope>`'s, else the main view. */
  token?: StageTokenProp;
  class?: string;
  style?: string;
}

export type ScrollbarAxis = 'x' | 'y';

export interface ScrollbarProps {
  axis: ScrollbarAxis;
  /** The stage lens to scroll: the nearest `<StageScope>` / `<Stage>`'s, else the main view. */
  token?: StageTokenProp;
  /**
   * Hide `autoHide` milliseconds after the view stops moving (a drag or the pointer over it
   * keeps it shown; a hidden bar ignores the pointer, like macOS). `false` always shows it.
   * Published as `data-state="visible|hidden"`. Default 1200.
   */
  autoHide?: number | false;
  /** The smallest thumb, in pixels, so it never vanishes on a long document. Default 24. */
  minThumbSize?: number;
  /**
   * A press on the track: `'page'` steps 90% of a view toward the pointer and repeats while
   * held, stopping at the pointer; `'jump'` centers the thumb at the pointer and drags from
   * there. Default `'page'`.
   */
  trackPress?: 'page' | 'jump';
  /**
   * The track's class and style. The default style pins it to the right (y) or bottom (x) edge
   * of the nearest positioned ancestor: the Stage, when it's in the overlay.
   */
  class?: string;
  style?: string;
  thumbClass?: string;
  thumbStyle?: string;
}
