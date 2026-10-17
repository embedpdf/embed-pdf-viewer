<!--
  The Stage: lays out the document's pages by the camera, keeps only the visible ones mounted,
  and draws its content (the `children` snippet) on each; you bring the layers. Pointer, wheel and touch input go
  through `@embedpdf/web`'s stage surface, so every framework has one feel.

  Everything inside binds to this lens: a `useStageState()` in a page's chrome or a
  `<Scrollbar>` in the overlay needs no token. The overlay also gets the Stage's projection, so
  anchored UI follows the camera in the same flush as the pages.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import type { CapabilityToken } from '@embedpdf/core';
  import type { PageFrame } from '@embedpdf/core-geometry';
  import { createScrollHandler, DEFAULT_SETTINGS, stageState } from '@embedpdf/plugin-stage';
  import type { VisiblePage } from '@embedpdf/plugin-stage';
  import type { StageHostCapability } from '@embedpdf/plugin-stage/contract/host';
  import { InteractionToken as InteractionPublicToken } from '@embedpdf/plugin-interaction/contract';
  import { InteractionToken } from '@embedpdf/plugin-interaction/contract/host';
  import { createStageSurface, stageViewProjector } from '@embedpdf/web';
  import { setProjectorBinding, setShownPages, type ShownPages } from '../anchored/context';
  import {
    useCapabilityEvent,
    useDocumentId,
    useKernelValue,
    useOptionalCapability,
    useOptionalSelector,
  } from '../runtime/readers.svelte';
  import { declaredState } from '../runtime/state.svelte';
  import { useKernelBinding } from '../runtime/binding.svelte';
  import PageSurface from './PageSurface.svelte';
  import type { StageProps } from './props';
  import { setStageToken, stageTokenOf } from './stage-scope';
  import { syncTwoWay } from './two-way.svelte';

  let {
    children,
    pageChrome,
    overlay,
    tool = $bindable(),
    onToolChange,
    page = $bindable(),
    zoom = $bindable(),
    token: explicitToken,
    class: className,
    style,
  }: StageProps = $props();

  const token = stageTokenOf(() => explicitToken);
  setStageToken(token);
  // The surface is a host of the lens: it reports the viewport size, drives gestures and reads
  // the lens id. The host contract is the same runtime token, typed wider.
  const hostToken = () => token() as unknown as CapabilityToken<StageHostCapability>;
  const stage = useOptionalCapability(hostToken);
  const interaction = useOptionalCapability(InteractionToken);
  const documentId = useDocumentId();

  const NO_PAGES: readonly VisiblePage[] = [];
  // The visible pages already fold in the camera (each carries its snapped screen position and
  // transform), so panning gives a new list: no separate camera subscription.
  const pages = useOptionalSelector(hostToken, (lens) => lens.listVisiblePages(), NO_PAGES);
  const settings = useOptionalSelector(hostToken, (lens) => lens.getSettings(), DEFAULT_SETTINGS);
  // The reserved bands around every page, compared by side so an equal frame changes nothing.
  const frame = useOptionalSelector(
    hostToken,
    (lens) => lens.getSettings().pageFrame,
    DEFAULT_SETTINGS.pageFrame,
    (left: PageFrame, right: PageFrame) =>
      left.top === right.top &&
      left.right === right.right &&
      left.bottom === right.bottom &&
      left.left === right.left,
  );

  // How this view takes pointer input is its own settings: routed to the interaction plugin
  // (which also registers this view's pan-scroll handler, scoped to it, so two Stages on one
  // document never pan each other), or the Stage's own drag-to-pan without it.
  const routed = $derived(settings.current.interaction && interaction.current !== null);
  const panFallback = $derived(settings.current.panFallback);
  const zoomGestures = $derived(settings.current.zoomGestures);
  // The cursor the interaction plugin resolves (text, grab, …), on the viewport while routed.
  const hubCursor = useKernelValue(() => interaction.current?.getCursor() ?? 'default');

  let element: HTMLDivElement | undefined;

  $effect(() => {
    const lens = stage.current;
    const hub = routed ? interaction.current : null;
    const gestures = zoomGestures;
    const fallback = panFallback;
    if (!element || !lens) return;
    return untrack(() => {
      const detachSurface = createStageSurface(element!, lens, {
        hub,
        source: lens.getLensId(),
        zoomGestures: gestures,
      });
      const offScroll = hub
        ? hub.registerHandler(createScrollHandler(lens, hub, { panFallback: fallback }), {
            source: lens.getLensId(),
          })
        : null;
      return () => {
        offScroll?.();
        detachSurface();
      };
    });
  });

  // ── two-way values ─────────────────────────────────────────────────────────

  // The bound tool wins whenever it's set, again when the document changes.
  $effect(() => {
    const wanted = tool;
    const hub = interaction.current;
    if (wanted === undefined || !hub) return;
    untrack(() => {
      if (hub.getActiveToolId() !== wanted) hub.activateTool(wanted);
    });
  });
  useCapabilityEvent(
    InteractionPublicToken,
    (hub) => hub.onToolChanged,
    (event) => {
      if (tool !== undefined) tool = event.toolId;
      onToolChange?.(event.toolId);
    },
  );

  const binding = useKernelBinding();
  const view = declaredState(binding, token, stageState.read, stageState.empty);
  syncTwoWay({
    stage: () => view().currentPageIndex,
    bound: () => page,
    ready: () => stage.current !== null,
    write: (value) => (page = value),
    apply: (value) => stage.current?.goToPage(value),
  });
  syncTwoWay({
    stage: () => view().zoomLevel,
    bound: () => zoom,
    ready: () => stage.current !== null,
    write: (value) => (zoom = value),
    apply: (value) => stage.current?.zoomTo(value),
  });

  // ── what the overlay anchors to ───────────────────────────────────────────

  // Anchored UI positions through the camera: pure state, no DOM reads. The visible pages are
  // the binding's revision, so a camera change moves the pages and every anchored element in
  // the same flush.
  const projector = stageViewProjector(() => stage.current);
  const projectorBinding = $derived({ projector, revision: pages.current });
  setProjectorBinding(() => projectorBinding);
  // The pages on screen as one value that changes only when a page comes or goes, so anchored
  // UI on the other pages sits out every camera frame.
  const shownKey = $derived(pages.current.map((visible) => visible.ref.objectNumber).join(','));
  const shownPages: ShownPages = $derived(new Set(shownKey ? shownKey.split(',').map(Number) : []));
  setShownPages(() => shownPages);
</script>

<div
  bind:this={element}
  class={className}
  style="position: relative; overflow: hidden; touch-action: none;{routed
    ? ` cursor: ${hubCursor.current};`
    : ''}{style ? ` ${style}` : ''}"
>
  {#if stage.current}
    {#each pages.current as visible (visible.ref.objectNumber)}
      <PageSurface
        documentId={documentId.current ?? ''}
        page={visible}
        frame={frame.current}
        stage={stage.current}
        content={children}
        chrome={pageChrome}
      />
    {/each}
  {/if}
  {@render overlay?.()}
</div>
