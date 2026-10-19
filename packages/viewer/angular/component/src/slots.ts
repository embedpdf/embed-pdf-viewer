/**
 * Your own components in the viewer: `<ng-template epdfToolbarItem="id">`,
 * `<ng-template epdfPanel="id">` and `<ng-template epdfRegion="name">` put what they hold in
 * the place the viewer makes for it (`item:<id>`, `panel:<id>`, or a region's name). The viewer
 * shows each one, once it's ready, as a child of its `<embedpdf-viewer>` element, inside an
 * element with that `slot` and `display: contents`: it stays in your app's tree (its injectors,
 * its state, its CSS), and the browser shows it in that place.
 *
 * `EpdfToolbarItemContext` tells a component inside a toolbar item where it sits. The viewer
 * keeps that on the item's element as `data-orientation`, `data-edge`, `data-variant` and
 * `data-size`; the item reads them, live, into signals, and draws again at once, before the
 * browser lays the bar out, so the toolbar measures your component in the variant it picked.
 * Types only from the viewer: this module is shared by both doors.
 */
import {
  computed,
  Directive,
  ElementRef,
  inject,
  Injectable,
  Injector,
  input,
  signal,
  TemplateRef,
  untracked,
  ViewContainerRef,
  type OnChanges,
  type OnDestroy,
  type Signal,
  type WritableSignal,
} from '@angular/core';
import type { ToolbarItemContext, ToolbarItemEdge, ViewerSize } from '@embedpdf/viewer/core';

// ── the templates you give ───────────────────────────────────────────────────

/** Your component in the toolbar, where the layout's `{ custom: id }` makes room for it. */
@Directive({ selector: 'ng-template[epdfToolbarItem]' })
export class EpdfToolbarItem {
  /** The item's id: `{ custom: id }` in the layout. */
  readonly id = input.required<string>({ alias: 'epdfToolbarItem' });
  readonly template = inject<TemplateRef<void>>(TemplateRef);
}

/** What goes inside a panel: the viewer draws its frame, header and the way it opens. */
@Directive({ selector: 'ng-template[epdfPanel]' })
export class EpdfPanel {
  /** The panel's id, as `addPanel(id, …)` names it in the layout. */
  readonly id = input.required<string>({ alias: 'epdfPanel' });
  readonly template = inject<TemplateRef<void>>(TemplateRef);
}

/**
 * A place around the viewer for your own components: `header` above everything, `footer` below
 * everything, `tabs` in place of the document tabs, `empty` over the pages while no document is
 * open.
 */
export type RegionName = 'header' | 'footer' | 'tabs' | 'empty';

/** Your component in one of the viewer's regions. */
@Directive({ selector: 'ng-template[epdfRegion]' })
export class EpdfRegion {
  readonly name = input.required<RegionName>({ alias: 'epdfRegion' });
  readonly template = inject<TemplateRef<void>>(TemplateRef);
}

// ── where a toolbar item sits ────────────────────────────────────────────────

const outsideAToolbarItem = (): never => {
  throw new Error(
    '[embedpdf] inject(EpdfToolbarItemContext) works in a component inside ' +
      '<ng-template epdfToolbarItem>: it says where that item sits.',
  );
};

/**
 * Where the toolbar item your component is in sits, as signals: which way its bar runs
 * (`orientation()`), the bar's place (`edge()`), which of the item's `variants` the toolbar
 * picked (`variant()`), and the viewer's size (`size()`). Inject it in a component inside an
 * `<ng-template epdfToolbarItem>`.
 */
@Injectable({ providedIn: 'root', useFactory: outsideAToolbarItem })
export abstract class EpdfToolbarItemContext {
  abstract readonly orientation: Signal<ToolbarItemContext['orientation']>;
  abstract readonly edge: Signal<ToolbarItemEdge>;
  abstract readonly variant: Signal<string | null>;
  abstract readonly size: Signal<ViewerSize>;
}

const EDGES: readonly ToolbarItemEdge[] = ['top', 'bottom', 'start', 'end', 'float', 'selection'];
const SIZES: readonly ViewerSize[] = ['compact', 'medium', 'expanded'];
const ATTRIBUTES = ['data-orientation', 'data-edge', 'data-variant', 'data-size'];

/** Before the viewer says where the item is: the main bar's place. */
const AT_THE_TOP: ToolbarItemContext = {
  orientation: 'horizontal',
  edge: 'top',
  variant: null,
  size: 'expanded',
};

/** Where the item whose element is `element` sits, as the viewer wrote it there. */
function toolbarItemContextOf(element: Element): ToolbarItemContext {
  const edge = element.getAttribute('data-edge') as ToolbarItemEdge | null;
  const size = element.getAttribute('data-size') as ViewerSize | null;
  return {
    orientation:
      element.getAttribute('data-orientation') === 'vertical' ? 'vertical' : 'horizontal',
    edge: edge && EDGES.includes(edge) ? edge : AT_THE_TOP.edge,
    variant: element.getAttribute('data-variant'),
    size: size && SIZES.includes(size) ? size : AT_THE_TOP.size,
  };
}

const sameContext = (left: ToolbarItemContext, right: ToolbarItemContext): boolean =>
  left.orientation === right.orientation &&
  left.edge === right.edge &&
  left.variant === right.variant &&
  left.size === right.size;

/** The context of the item drawn in `element`, read from what the viewer writes on it. */
class ToolbarItemPlace extends EpdfToolbarItemContext {
  private readonly element: Element;
  private readonly place: WritableSignal<ToolbarItemContext>;
  readonly orientation = computed(() => this.place().orientation);
  readonly edge = computed(() => this.place().edge);
  readonly variant = computed(() => this.place().variant);
  readonly size = computed(() => this.place().size);

  constructor(element: Element) {
    super();
    this.element = element;
    this.place = signal(toolbarItemContextOf(element), { equal: sameContext });
  }

  /** Follow what the viewer writes on the element; `changed` runs after each change. */
  follow(changed: () => void): () => void {
    const observer = new MutationObserver(() => {
      const before = untracked(this.place);
      this.place.set(toolbarItemContextOf(this.element));
      if (untracked(this.place) !== before) changed();
    });
    observer.observe(this.element, { attributes: true, attributeFilter: ATTRIBUTES });
    return () => observer.disconnect();
  }
}

/**
 * Shows a toolbar item's template in the element around this `<ng-container>`, with `injector`
 * and the item's context over it, and again with each new injector (a new viewer). When the
 * viewer writes where the item sits, it draws the template again in the same microtask, so the
 * bar measures what the template draws there.
 */
@Directive({ selector: 'ng-container[epdfToolbarItemView]' })
export class EpdfToolbarItemView implements OnChanges, OnDestroy {
  readonly item = input.required<EpdfToolbarItem>({ alias: 'epdfToolbarItemView' });
  readonly injector = input.required<Injector>();

  private readonly container = inject(ViewContainerRef);
  private readonly anchor = inject<ElementRef<Node>>(ElementRef).nativeElement;
  private hide: (() => void) | null = null;

  ngOnChanges(): void {
    this.hide?.();
    const place = new ToolbarItemPlace(this.anchor.parentElement!);
    const view = this.container.createEmbeddedView(this.item().template, undefined, {
      injector: Injector.create({
        providers: [{ provide: EpdfToolbarItemContext, useValue: place }],
        parent: this.injector(),
      }),
    });
    const stop = place.follow(() => view.detectChanges());
    this.hide = () => {
      stop();
      view.destroy();
    };
  }

  ngOnDestroy(): void {
    this.hide?.();
  }
}
