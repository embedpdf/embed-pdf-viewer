<!--
  <SelectionHandles>: the grips at the two ends of the selected text, drawn the
  way phones draw them: a thin caret bar that is the selection's own start or
  end edge (so turned text and turned pages carry the grip with them), capped
  by a circle that keeps its size on screen, above the first line at the start
  and below the last line at the end.

  On touch, where nobody drags a caret, the grips are how a selection grows or
  shrinks: a long press selects a word, then each grip extends from the other
  end, snapping to glyphs and crossing pages exactly like a pointer drag, so
  highlights, menus and the commit event all behave the same. Mount it in the
  <Stage>'s #overlay slot next to <SelectionMenu>; elsewhere it draws nothing
  (a <PageView> has no camera to project through). Grabbing a grip never pans
  the Stage. Painted in the plugin's `handles` setting, which the
  `--epdf-text-selection-handle` and `--epdf-text-selection-handle-shadow` CSS
  variables override.

  What it draws is the plugin's (the view over the Stage, the endpoints,
  `selectionHandleGeom`, the armed drag) and how a grip follows the pointer is
  `@embedpdf/web`'s (`attachSelectionHandle`);
  this component keeps what only Vue does: the subscriptions and the markup.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { CSSProperties } from 'vue';
import {
  HANDLE_BAR,
  HANDLE_HEAD,
  HANDLE_PAD,
  armSelectionHandle,
  selectionHandleEndpointsOf,
  selectionHandleGeom,
  selectionHandleViewOf,
} from '@embedpdf/plugin-selection';
import { SelectionToken as SelectionHostToken } from '@embedpdf/plugin-selection/contract/host';
import { attachSelectionHandle, paint, sameSelectionEndpoints } from '@embedpdf/web';
import { useOptionalProjectorBinding } from '../anchored/projector';
import { devWarn } from '../dev';
import { useCapability, useOptionalCapability, useOptionalSelector } from '../runtime/capabilities';
import { useViewerSettings } from '../runtime/documents';
import { useKernelValue } from '../runtime/kernel';
import { useStageToken } from '../stage/scope';
import type { StageTokenProp } from '../stage/scope';
import { useSelectionSettings, useSelectionState } from './composables';

type Role = 'start' | 'end';

const props = defineProps<{
  /** The stage view this overlay belongs to. Default: the enclosing `<Stage>`'s. */
  token?: StageTokenProp;
}>();

const token = useStageToken(() => props.token);
const host = useCapability(SelectionHostToken);
const stage = useOptionalCapability(token);

// Outside a Stage there is no camera to project through: say so, rather than
// drawing nothing without a word.
const surface = useOptionalProjectorBinding();
if (!surface || surface.value.projector.space !== 'overlay') {
  devWarn(
    'selection-handles-outside-stage',
    '<SelectionHandles> renders nothing here: mount it in the <Stage> #overlay slot ' +
      '(a <PageView> has no camera to project the handles through).',
  );
}

const selecting = useSelectionState((state) => state.isSelecting);
const visible = useOptionalSelector(SelectionHostToken, (lens) => lens.isHighlightVisible(), false);
const handles = useSelectionSettings((settings) => settings.handles);
const accent = useViewerSettings((settings) => settings.accent);
const endpoints = useOptionalSelector(
  SelectionHostToken,
  (lens) => selectionHandleEndpointsOf(lens.getSnapshot()),
  null,
  sameSelectionEndpoints,
);
// The grips are placed by projecting the endpoints through the camera, so they
// follow every camera move. The visible pages are the stage's one value for
// that (the pages move on it too, so grip and highlight move in one frame).
const camera = useKernelValue(() => stage.value?.listVisiblePages() ?? null);
const dragging = ref<Role | null>(null);

/** Where each grip goes, in the overlay's pixels; null for one whose page isn't laid out. */
const geometry = computed(() => {
  void camera.value;
  const lens = stage.value;
  const ends = endpoints.value;
  if (!lens || !ends) return null;
  const view = selectionHandleViewOf(lens);
  return {
    start: selectionHandleGeom(view, ends.start, 'start'),
    end: selectionHandleGeom(view, ends.end, 'end'),
  };
});

// Hidden while a pointer drag selects (like the menu), but a grip drag is a
// selection gesture too, and keeps its grips.
const shown = computed(
  () => geometry.value !== null && visible.value && (!selecting.value || dragging.value !== null),
);

// Each is its CSS variable first, then the setting; an unset color is the accent.
const color = computed(() => paint('text-selection-handle', handles.value.color ?? accent.value));
const shadow = computed(() => paint('text-selection-handle-shadow', handles.value.shadow));

/**
 * One grip's three boxes. The grip is laid out upright in its own frame (a bar
 * the edge's length, the head above it at the start, below it at the end),
 * then turned onto the projected edge about the bar's ascent tip, the one
 * point that must land exactly on the glyph's corner.
 */
function gripStyles(role: Role): Record<'grip' | 'bar' | 'head', CSSProperties> | null {
  const grip = geometry.value?.[role];
  if (!grip) return null;
  const barTop = HANDLE_PAD + (role === 'start' ? HANDLE_HEAD : 0);
  const pivotX = HANDLE_PAD + HANDLE_BAR / 2;
  return {
    grip: {
      position: 'absolute',
      left: `${grip.bar.from.x - pivotX}px`,
      top: `${grip.bar.from.y - barTop}px`,
      width: `${HANDLE_BAR + 2 * HANDLE_PAD}px`,
      height: `${grip.length + HANDLE_HEAD + 2 * HANDLE_PAD}px`,
      // Upright text carries no transform: pixel-identical to an axis-aligned box.
      ...(grip.upright
        ? {}
        : { transform: `rotate(${grip.rotation}deg)`, transformOrigin: `${pivotX}px ${barTop}px` }),
      touchAction: 'none',
      cursor: 'grab',
      pointerEvents: 'auto',
    },
    // The caret bar: the selection's own edge, the glyph's ink height at any tilt.
    bar: {
      position: 'absolute',
      left: `${HANDLE_PAD}px`,
      top: `${barTop}px`,
      width: `${HANDLE_BAR}px`,
      height: `${grip.length}px`,
      background: color.value,
      borderRadius: `${HANDLE_BAR / 2}px`,
    },
    // The head, flush against the bar: past the ascent at the start, past the
    // baseline at the end, in the text's frame.
    head: {
      position: 'absolute',
      left: `${pivotX - HANDLE_HEAD / 2}px`,
      top: `${role === 'start' ? HANDLE_PAD : HANDLE_PAD + grip.length}px`,
      width: `${HANDLE_HEAD}px`,
      height: `${HANDLE_HEAD}px`,
      borderRadius: '50%',
      background: color.value,
      boxShadow: shadow.value,
    },
  };
}

const startStyles = computed(() => gripStyles('start'));
const endStyles = computed(() => gripStyles('end'));

/**
 * Arm a grip drag at the press. It reads the stage and the endpoints as they
 * are now, never as they were when the listener was attached.
 */
function arm(role: Role) {
  const lens = stage.value;
  const ends = endpoints.value;
  if (!lens || !ends) return null;
  const armed = armSelectionHandle(host, selectionHandleViewOf(lens), ends, role);
  if (!armed) return null;
  dragging.value = role;
  return {
    // The point the user grabbed: the bar's midpoint.
    base: armed.base,
    session: {
      move: armed.drag.move,
      end: () => {
        armed.drag.end(); // the selection settles: the menu comes back, the commit event fires
        dragging.value = null;
      },
    },
  };
}

const startGrip = ref<HTMLDivElement | null>(null);
const endGrip = ref<HTMLDivElement | null>(null);
// The press is taken with a native listener on the grip itself, so the Stage
// never sees it; a grip that remounts is bound again.
for (const [role, element] of [
  ['start', startGrip],
  ['end', endGrip],
] as const) {
  watch(
    element,
    (grip, _previous, onCleanup) => {
      if (grip) onCleanup(attachSelectionHandle(grip, { arm: () => arm(role) }));
    },
    { flush: 'post' },
  );
}
</script>

<template>
  <template v-if="shown">
    <div v-if="startStyles" ref="startGrip" :style="startStyles.grip">
      <div :style="startStyles.bar" />
      <div :style="startStyles.head" />
    </div>
    <div v-if="endStyles" ref="endGrip" :style="endStyles.grip">
      <div :style="endStyles.bar" />
      <div :style="endStyles.head" />
    </div>
  </template>
</template>
