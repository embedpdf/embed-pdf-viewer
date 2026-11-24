/**
 * The page's fields as they look now, for `<FormLayer>`. Each widget shows its
 * picture, as the engine draws it (the form plugin's, every state loaded, so a
 * check box shows its new state at once), or the painter's drawing while its
 * look is pending or its picture is of an older version (`pictureOrPainting`):
 * a value, a calculation, a restyle shows at once. Hidden widgets aren't
 * listed, nor one with nothing to show yet.
 */
import { computed, onUnmounted, shallowRef, watch } from 'vue';
import type { ComputedRef } from 'vue';
import { annotationKey, shallowEqual } from '@embedpdf/core';
import { MITER_LIMIT } from '@embedpdf/core-annotation';
import { FormToken as FormHostToken } from '@embedpdf/plugin-form/contract/host';
import type { ShownWidget } from '@embedpdf/plugin-form/contract/host';
import { RenderToken } from '@embedpdf/plugin-render/contract/host';
import {
  createShownUrls,
  loadAppearanceUrls,
  pictureOrPainting,
  rectInPixels,
  shownAppearance,
  svgShapesOf,
  type AppearanceUrl,
  type PixelRect,
  type SvgShape,
} from '@embedpdf/web';
import { useOptionalCapability, useOptionalSelector } from '../runtime/capabilities';
import { usePage } from '../runtime/page';

const NO_WIDGETS: readonly ShownWidget[] = Object.freeze([]);

/**
 * A widget as the layer draws it: its picture, or the painter's shapes in the
 * rect it stands in. `frame` is that rect in the page layer's pixels.
 */
export type ShownLook = { key: string; frame: PixelRect } & (
  | { kind: 'picture'; url: string }
  | { kind: 'painting'; viewBox: string; shapes: SvgShape[] }
);

/** The looks of the page's widgets, in the order the page draws them. */
export function useFieldLooks(): ComputedRef<ShownLook[]> {
  const page = usePage();
  const form = useOptionalCapability(FormHostToken);
  // The same list until a widget on this page changes.
  const widgets = useOptionalSelector(
    FormHostToken,
    (form) => form.listShownWidgets(page.value.ref),
    NO_WIDGETS,
    shallowEqual,
  );
  // Loaded again when one of the page's widgets is drawn again, and at appearance-scale crossings.
  const epoch = useOptionalSelector(
    FormHostToken,
    (form) => form.getAppearanceEpoch(page.value.ref),
    '',
  );
  const scale = useOptionalSelector(
    RenderToken,
    (lens) => lens.getAppearanceScale(page.value.transform.renderScale),
    0,
  );

  // `null` until the page's first pictures arrive.
  const urls = shallowRef<Record<string, AppearanceUrl> | null>(null);
  // The pictures shown stay valid until the next ones are shown.
  const shown = createShownUrls();
  onUnmounted(() => shown.release());
  watch(
    [form, () => page.value.ref, scale, epoch],
    ([host, pageRef, at], _previous, onCleanup) => {
      if (!host || !at) return;
      onCleanup(
        loadAppearanceUrls(
          shown,
          (signal) => host.renderAppearances(pageRef, at, signal),
          annotationKey,
          (loaded) => (urls.value = loaded),
        ),
      );
    },
    { immediate: true },
  );

  return computed(() =>
    widgets.value.flatMap((widget): ShownLook[] => {
      const key = annotationKey(widget.ref);
      const look = pictureOrPainting({
        pending: widget.pending,
        picture: urls.value && shownAppearance(urls.value, key, widget.appearanceState),
        version: widget.pictureVersion,
        loaded: urls.value !== null,
        paint: () => form.value?.getWidgetPainting(widget.ref) ?? null,
      });
      if (!look) return [];
      // Where the widget is now: a move keeps its picture, which comes along with it.
      const frame = rectInPixels(widget.rect, page.value.transform);
      if (look.kind === 'picture') {
        return [{ kind: 'picture', key, url: look.picture.url, frame }];
      }
      const { x, y, width, height } = widget.rect;
      return [
        {
          kind: 'painting',
          key,
          viewBox: `${x} ${y} ${width} ${height}`,
          shapes: svgShapesOf(look.painting.scene, { miterLimit: MITER_LIMIT }),
          frame,
        },
      ];
    }),
  );
}
