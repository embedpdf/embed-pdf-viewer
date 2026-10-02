/**
 * The selection chrome's paint, following the annotation settings and the viewer's accent live:
 * every color, width and dash as CSS text for a `style` attribute (`annotationChromePaint` from
 * `@embedpdf/web` gives them as records, each its `--epdf-annotation-*` variable first).
 */
import type { ChromeSettings } from '@embedpdf/plugin-annotation';
import { annotationChromePaint, cssText, type AnnotationChromePaint } from '@embedpdf/web';
import { useViewerSettings } from '../runtime/documents.svelte';
import { useAnnotationSettings } from './state';

/** The painted chrome, as CSS text per part. */
export interface ChromePaintCss {
  /** The selection box. */
  outline: string;
  /** The resize and point handles. */
  handle: string;
  /** The rotation handle. */
  rotationHandle: string;
  /** The rotation handle's stalk: the handle's stroke. */
  rotationStalk: string;
  /** A snapped move's alignment guide. */
  guide: string;
  /** The reference cross and the angle line while turning. */
  rotationGuide: string;
  /** The box dragged to select. */
  marquee: string;
  /** The outline color of a text box while someone types in it. */
  textOutline: string;
}

const asCss = (painted: AnnotationChromePaint): ChromePaintCss => ({
  outline: cssText(painted.outline),
  handle: cssText(painted.handle),
  rotationHandle: cssText(painted.rotationHandle),
  rotationStalk: cssText({ stroke: painted.rotationHandle.stroke }),
  guide: cssText(painted.guide),
  rotationGuide: cssText(painted.rotationGuide),
  marquee: cssText(painted.marquee),
  textOutline: painted.textOutline,
});

/** The chrome settings and their paint; call it while a component is created. */
export function useChromePaint(): {
  readonly chrome: ChromeSettings;
  readonly css: ChromePaintCss;
} {
  const chrome = useAnnotationSettings((settings) => settings.chrome);
  const accent = useViewerSettings((settings) => settings.accent);
  const css = $derived(asCss(annotationChromePaint(chrome.current, accent.current)));
  return {
    get chrome() {
      return chrome.current;
    },
    get css() {
      return css;
    },
  };
}
