/**
 * The selection chrome's settings, for the parts that paint it: the plugin's `chrome` settings
 * and the viewer's accent, which a chrome color left `null` follows. Settings belong to the
 * plugin, not to a document, so they read before any document opens.
 */
import { computed, type Signal } from '@angular/core';
import { injectKernelHost } from '@embedpdf/angular/runtime';
import {
  ANNOTATION_DEFAULTS,
  AnnotationToken,
  type AnnotationSettings,
  type ChromeSettings,
} from '@embedpdf/plugin-annotation';

export interface ChromeSettingsSignals {
  /** The `chrome` settings: the same object until one of them changes. */
  readonly chrome: Signal<ChromeSettings>;
  /** The viewer's accent. */
  readonly accent: Signal<string>;
}

/** The chrome settings and the accent, as signals. Call it in an injection context. */
export function injectChromeSettings(): ChromeSettingsSignals {
  const host = injectKernelHost('<epdf-annotation-layer>');
  // Without the plugin there is nothing to paint; the defaults keep the reads simple.
  const settings: Signal<AnnotationSettings> = host.provides(AnnotationToken)
    ? host.settingsOf<AnnotationSettings>(AnnotationToken).current
    : computed(() => ANNOTATION_DEFAULTS);
  return {
    chrome: computed(() => settings().chrome),
    accent: computed(() => host.viewerSettings().accent),
  };
}
