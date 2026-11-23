/**
 * The page's fields as they look now, for `<FormLayer>` to draw. Each widget shows its picture,
 * as the engine draws it (the form plugin's, every state loaded, so a check box shows its new
 * state at once), or the painter's drawing while its look is pending or its picture is of an
 * older version (`pictureOrPainting`): a value, a calculation, a restyle shows at once. Hidden
 * widgets aren't listed, nor one with nothing to show yet.
 */
import { untrack } from 'svelte';
import { annotationKey } from '@embedpdf/core';
import { MITER_LIMIT } from '@embedpdf/core-annotation';
import { FormToken as FormHostToken, type ShownWidget } from '@embedpdf/plugin-form/contract/host';
import { RenderToken } from '@embedpdf/plugin-render/contract/host';
import {
  createShownUrls,
  loadAppearanceUrls,
  pictureOrPainting,
  shownAppearance,
  svgShapesOf,
  type AppearanceUrl,
  type SvgShape,
} from '@embedpdf/web';
import { usePage } from '../runtime/page';
import {
  shallowArray,
  useOptionalCapability,
  useOptionalSelector,
} from '../runtime/readers.svelte';
import type { CurrentValue } from '../runtime/values.svelte';

const NO_WIDGETS: readonly ShownWidget[] = Object.freeze([]);

/** A widget as the layer draws it: its picture, or the painter's shapes, in the rect it stands in. */
export interface ShownLook {
  /** The widget's key (`annotationKey`). */
  key: string;
  /** Where the widget stands, in page points: its picture and the painter's drawing fill it. */
  rect: ShownWidget['rect'];
  url: string | null;
  painting: { viewBox: string; shapes: SvgShape[] } | null;
}

/** The looks of the widgets the page in context shows, in the order the page draws them. */
export function useFieldLooks(): CurrentValue<readonly ShownLook[]> {
  const page = usePage();
  const form = useOptionalCapability(FormHostToken);
  // The same list until a widget on this page changes.
  const widgets = useOptionalSelector(
    FormHostToken,
    (form) => form.listShownWidgets(page.ref),
    NO_WIDGETS,
    shallowArray,
  );
  // Loaded again when one of the page's widgets is drawn again, and at appearance-scale crossings.
  const epoch = useOptionalSelector(FormHostToken, (form) => form.getAppearanceEpoch(page.ref), '');
  const scale = useOptionalSelector(
    RenderToken,
    (renderer) => renderer.getAppearanceScale(page.transform.renderScale),
    0,
  );

  // `null` until the page's first pictures arrive.
  let urls = $state.raw<Record<string, AppearanceUrl> | null>(null);
  // The pictures shown stay valid until the next ones are shown.
  const shown = createShownUrls();
  $effect(() => () => shown.release());
  $effect(() => {
    const host = form.current;
    const ref = page.ref;
    const at = scale.current;
    void epoch.current;
    if (!host || !at) return;
    return untrack(() =>
      loadAppearanceUrls(
        shown,
        (signal) => host.renderAppearances(ref, at, signal),
        annotationKey,
        (loaded) => (urls = loaded),
      ),
    );
  });

  const looks = $derived(
    widgets.current.flatMap((widget): ShownLook[] => {
      const key = annotationKey(widget.ref);
      const look = pictureOrPainting({
        pending: widget.pending,
        picture: urls && shownAppearance(urls, key, widget.appearanceState),
        version: widget.pictureVersion,
        loaded: urls !== null,
        paint: () => form.current?.getWidgetPainting(widget.ref) ?? null,
      });
      if (!look) return [];
      if (look.kind === 'picture') {
        return [{ key, rect: widget.rect, url: look.picture.url, painting: null }];
      }
      const { x, y, width, height } = widget.rect;
      return [
        {
          key,
          rect: widget.rect,
          url: null,
          painting: {
            viewBox: `${x} ${y} ${width} ${height}`,
            shapes: svgShapesOf(look.painting.scene, { miterLimit: MITER_LIMIT }),
          },
        },
      ];
    }),
  );

  return {
    get current() {
      return looks;
    },
  };
}
