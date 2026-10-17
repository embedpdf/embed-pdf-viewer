/**
 * Your own components in the viewer: `ToolbarItem`, `Panel` and `Region` put
 * your component in the place the viewer makes for it (`item:<id>`,
 * `panel:<id>`, or a region's name). It renders as a child of the
 * `<embedpdf-viewer>` element, so it stays in your Vue app, with what it
 * provides and injects, your state and your CSS; the browser shows it in that
 * place.
 *
 * `useToolbarItem()` tells a component inside a `ToolbarItem` where it sits.
 * The viewer keeps that on the item's element as `data-orientation`,
 * `data-edge`, `data-variant` and `data-size`; `ToolbarItem` reads them, live,
 * into a reactive object, and Vue draws the change in the same task, before the
 * browser lays the bar out, so the toolbar measures your component in the
 * variant it picked. Types only from the viewer, as in `./component`: this
 * module is shared by both doors.
 */
import type { ToolbarItemContext, ToolbarItemEdge, ViewerSize } from '@embedpdf/viewer/core';
import {
  defineComponent,
  h,
  inject,
  onBeforeUnmount,
  onMounted,
  provide,
  shallowReactive,
  shallowReadonly,
  shallowRef,
  type InjectionKey,
  type SlotsType,
  type VNode,
} from 'vue';

/** The element around what you put in a place adds no box: your component lays out there. */
const CONTENTS = { display: 'contents' } as const;

/** What a place holds: your components. */
type DefaultSlot = SlotsType<{ default?: () => VNode[] }>;

// ── a toolbar item ───────────────────────────────────────────────────────────

const EDGES: readonly ToolbarItemEdge[] = ['top', 'bottom', 'start', 'end', 'float', 'selection'];
const SIZES: readonly ViewerSize[] = ['compact', 'medium', 'expanded'];

/** Before the viewer says where the item is: the main bar's place. */
const AT_THE_TOP: ToolbarItemContext = {
  orientation: 'horizontal',
  edge: 'top',
  variant: null,
  size: 'expanded',
};

const ATTRIBUTES = ['data-orientation', 'data-edge', 'data-variant', 'data-size'];

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

const ToolbarItemKey: InjectionKey<Readonly<ToolbarItemContext>> = Symbol('embedpdf toolbar item');

export interface ToolbarItemProps {
  /** The item's id: `{ custom: id }` in the layout. */
  id: string;
}

/** Your component in the toolbar, where the layout's `{ custom: id }` makes room for it. */
export const ToolbarItem = defineComponent(
  (props: ToolbarItemProps, { slots }) => {
    const element = shallowRef<HTMLDivElement | null>(null);
    // One field each, so a component reading only `orientation` draws again only when it changes.
    const context = shallowReactive<ToolbarItemContext>({ ...AT_THE_TOP });
    provide(ToolbarItemKey, shallowReadonly(context));

    let observer: MutationObserver | null = null;
    onMounted(() => {
      const target = element.value!;
      // A field set to the value it has changes nothing, so only what the viewer changed redraws.
      const read = () => Object.assign(context, toolbarItemContextOf(target));
      read();
      observer = new MutationObserver(read);
      observer.observe(target, { attributes: true, attributeFilter: ATTRIBUTES });
    });
    onBeforeUnmount(() => observer?.disconnect());

    return () =>
      h('div', { ref: element, slot: `item:${props.id}`, style: CONTENTS }, slots.default?.());
  },
  { name: 'ToolbarItem', props: ['id'], slots: Object as DefaultSlot },
);

/**
 * Where the toolbar item this component is in sits, as a reactive object: which way its bar
 * runs (`orientation`), the bar's place (`edge`), which of the item's `variants` the toolbar
 * picked (`variant`), and the viewer's size (`size`). Works inside a `ToolbarItem`.
 */
export function useToolbarItem(): Readonly<ToolbarItemContext> {
  const context = inject(ToolbarItemKey, null);
  if (!context) {
    throw new Error(
      '[embedpdf] useToolbarItem() works inside a <ToolbarItem>: it says where that item sits.',
    );
  }
  return context;
}

// ── a panel, a region ────────────────────────────────────────────────────────

export interface PanelProps {
  /** The panel's id, as `addPanel(id, …)` names it in the layout. */
  id: string;
}

/** What goes inside a panel: the viewer draws its frame, header and the way it opens. */
export const Panel = defineComponent(
  (props: PanelProps, { slots }) =>
    () =>
      h('div', { slot: `panel:${props.id}`, style: CONTENTS }, slots.default?.()),
  { name: 'Panel', props: ['id'], slots: Object as DefaultSlot },
);

/**
 * A place around the viewer for your own components: `header` above everything, `footer` below
 * everything, `tabs` in place of the document tabs, `empty` over the pages while no document is
 * open.
 */
export type RegionName = 'header' | 'footer' | 'tabs' | 'empty';

export interface RegionProps {
  name: RegionName;
}

/** Your component in one of the viewer's regions. */
export const Region = defineComponent(
  (props: RegionProps, { slots }) =>
    () =>
      h('div', { slot: props.name, style: CONTENTS }, slots.default?.()),
  { name: 'Region', props: ['name'], slots: Object as DefaultSlot },
);
