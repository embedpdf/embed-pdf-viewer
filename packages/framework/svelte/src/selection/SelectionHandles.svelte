<!--
  Draggable selection handles, the way phones draw them: a thin caret bar that is the selection's
  own start or end edge (the boundary glyph's edge, so turned text and turned pages carry the
  handle with them), capped by a circle that keeps its size on screen, above the first line at
  the start and below the last line at the end.

  On touch, where nothing can drag a caret, the handles grow or shrink a selection: a long press
  selects a word, then each handle extends from the opposite end, snapping to glyphs and crossing
  pages like a pointer drag. A handle drag is the same selection gesture, so the highlight, the
  menu and the commit events behave the same.

  Mount it in a `<Stage>`'s overlay, next to `<SelectionMenu>`. Outside a Stage it draws nothing
  (a `<PageView>` has no camera to project the handles through). A press on a handle never pans
  the Stage. Painted in the plugin's `handles` setting, which the `--epdf-text-selection-handle`
  and `--epdf-text-selection-handle-shadow` CSS variables win over.

  The policy is shared: the view over the Stage, the endpoints, the geometry and the armed drag
  come from the selection plugin's `handles` module, the listener mechanics from
  `@embedpdf/web`'s `attachSelectionHandle`. This file keeps the subscriptions and the markup.
-->
<script lang="ts">
  import {
    HANDLE_BAR,
    HANDLE_HEAD,
    HANDLE_PAD,
    armSelectionHandle,
    selectionHandleEndpointsOf,
    selectionHandleGeom,
    selectionHandleViewOf,
    type SelectionHandleGeom,
  } from '@embedpdf/plugin-selection';
  import { SelectionToken } from '@embedpdf/plugin-selection/contract/host';
  import { attachSelectionHandle, paint, sameSelectionEndpoints } from '@embedpdf/web';
  import { useOptionalProjectorBinding } from '../anchored/context';
  import { devWarn } from '../runtime/dev';
  import { useViewerSettings } from '../runtime/documents.svelte';
  import {
    useCapability,
    useKernelValue,
    useOptionalCapability,
    useOptionalSelector,
  } from '../runtime/readers.svelte';
  import { stageTokenOf } from '../stage/stage-scope';
  import type { SelectionHandlesProps } from './props';
  import { useSelectionSettings, useSelectionState } from './readers.svelte';

  type Role = 'start' | 'end';

  let { token }: SelectionHandlesProps = $props();

  const host = useCapability(SelectionToken);
  const stage = useOptionalCapability(stageTokenOf(() => token));

  // Outside a Stage there is no camera to project through: say so instead of drawing nothing
  // without a word.
  const surface = useOptionalProjectorBinding();
  if (!surface || surface().projector.space !== 'overlay') {
    devWarn(
      'selection-handles-outside-stage',
      '<SelectionHandles> draws nothing here: put it in the <Stage> overlay snippet ' +
        '(a <PageView> has no camera to project the handles through).',
    );
  }

  const selecting = useSelectionState((selectionState) => selectionState.isSelecting);
  const visible = useOptionalSelector(SelectionToken, (lens) => lens.isHighlightVisible(), false);
  const handles = useSelectionSettings((settings) => settings.handles);
  const accent = useViewerSettings((settings) => settings.accent);
  const endpoints = useOptionalSelector(
    SelectionToken,
    (lens) => selectionHandleEndpointsOf(lens.getSnapshot()),
    null,
    sameSelectionEndpoints,
  );
  // The handles are placed by projecting the endpoints through the camera, so they move whenever
  // it does: the visible pages are the Stage's value for exactly that, the same one its pages
  // move on, so handle and highlight move in one frame.
  const camera = useKernelValue(() => stage.current?.listVisiblePages() ?? null);

  const geometry = $derived.by((): Record<Role, SelectionHandleGeom | null> | null => {
    void camera.current;
    const lens = stage.current;
    const ends = endpoints.current;
    if (!lens || !ends) return null;
    const view = selectionHandleViewOf(lens);
    return {
      start: selectionHandleGeom(view, ends.start, 'start'),
      end: selectionHandleGeom(view, ends.end, 'end'),
    };
  });

  // The handle being dragged: it keeps its handles shown while the selection is mid-gesture.
  let dragging = $state<Role | null>(null);

  /**
   * Arm a drag at the press. It reads the stage and the endpoints as they are now, not as they
   * were when the listener was attached.
   */
  function arm(role: Role) {
    const lens = stage.current;
    const ends = endpoints.current;
    if (!lens || !ends) return null;
    const armed = armSelectionHandle(host, selectionHandleViewOf(lens), ends, role);
    if (!armed) return null;
    dragging = role;
    return {
      // The point the user grabbed: the bar's midpoint.
      base: armed.base,
      session: {
        move: armed.drag.move,
        end: () => {
          armed.drag.end(); // settles the selection: the menu shows again, onCommitted fires
          dragging = null;
        },
      },
    };
  }

  /** The handle's listeners, as an attachment: a native press listener, so the Stage never sees it. */
  const bindHandle = (role: Role) => (element: HTMLElement) =>
    attachSelectionHandle(element, { arm: () => arm(role) });

  // Each is its CSS variable first, then the setting; an unset color is the accent.
  const color = $derived(paint('text-selection-handle', handles.current.color ?? accent.current));
  const shadow = $derived(paint('text-selection-handle-shadow', handles.current.shadow));

  // Hidden while a pointer drag selects (like the menu), but a handle drag is itself a selection
  // gesture, so it keeps its handles.
  const shown = $derived(
    stage.current !== null &&
      endpoints.current !== null &&
      visible.current &&
      (!selecting.current || dragging !== null),
  );
</script>

<!--
  One handle, laid out upright in its own frame (a bar as long as the edge, the head above it at
  the start or below it at the end), then turned onto the projected edge. The pivot is the bar's
  ascent-side tip, the one point that must land exactly on the glyph's corner. Upright text
  carries no transform.
-->
{#snippet handle(role: Role, at: SelectionHandleGeom)}
  {@const barTop = HANDLE_PAD + (role === 'start' ? HANDLE_HEAD : 0)}
  {@const pivotX = HANDLE_PAD + HANDLE_BAR / 2}
  <div
    {@attach bindHandle(role)}
    style:position="absolute"
    style:left="{at.bar.from.x - pivotX}px"
    style:top="{at.bar.from.y - barTop}px"
    style:width="{HANDLE_BAR + 2 * HANDLE_PAD}px"
    style:height="{at.length + HANDLE_HEAD + 2 * HANDLE_PAD}px"
    style:transform={at.upright ? undefined : `rotate(${at.rotation}deg)`}
    style:transform-origin={at.upright ? undefined : `${pivotX}px ${barTop}px`}
    style:touch-action="none"
    style:cursor="grab"
    style:pointer-events="auto"
  >
    <!-- The caret bar: the selection's own edge, as tall as the glyph's ink, at any tilt. -->
    <div
      style:position="absolute"
      style:left="{HANDLE_PAD}px"
      style:top="{barTop}px"
      style:width="{HANDLE_BAR}px"
      style:height="{at.length}px"
      style:background={color}
      style:border-radius="{HANDLE_BAR / 2}px"
    ></div>
    <!-- The head, against the bar: past the ascent at the start, past the baseline at the end,
         in the text's frame. -->
    <div
      style:position="absolute"
      style:left="{pivotX - HANDLE_HEAD / 2}px"
      style:top="{role === 'start' ? HANDLE_PAD : HANDLE_PAD + at.length}px"
      style:width="{HANDLE_HEAD}px"
      style:height="{HANDLE_HEAD}px"
      style:border-radius="50%"
      style:background={color}
      style:box-shadow={shadow}
    ></div>
  </div>
{/snippet}

{#if shown && geometry}
  <!-- A handle whose page isn't laid out right now draws nothing. -->
  {#if geometry.start}
    {@render handle('start', geometry.start)}
  {/if}
  {#if geometry.end}
    {@render handle('end', geometry.end)}
  {/if}
{/if}
