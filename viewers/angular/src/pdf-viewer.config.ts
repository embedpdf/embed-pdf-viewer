import {
  EnvironmentProviders,
  InjectionToken,
  Provider,
  inject,
  makeEnvironmentProviders,
} from '@angular/core'
import type { PDFViewerConfig } from '@embedpdf/snippet'

type ConfigRecord = Record<string, unknown>

const EMPTY_CONFIG: ConfigRecord = {}

/**
 * Hierarchical token that stores the default viewer config for the current injector.
 *
 * Prefer {@link provideEmbedPdfViewerConfig} over providing this token directly so
 * defaults are merged with any inherited config instead of replaced wholesale.
 */
export const EMBEDPDF_VIEWER_DEFAULT_CONFIG = new InjectionToken<PDFViewerConfig>(
  'EMBEDPDF_VIEWER_DEFAULT_CONFIG',
)

/**
 * Provides default viewer config for the current injector.
 *
 * The returned providers intentionally use Angular's regular `Provider[]` shape so
 * the helper can be used at application, route, or component scope. That allows an
 * app to define shared defaults once and override them for a specific viewer subtree
 * when needed.
 *
 * The supplied config is merged with the closest inherited config using
 * {@link mergeViewerConfigs}. Plain objects are merged deeply, `undefined` values are
 * ignored, and arrays are replaced by the most local value.
 */
export function provideEmbedPdfViewerConfig(config: PDFViewerConfig): Provider[] {
  return [
    {
      provide: EMBEDPDF_VIEWER_DEFAULT_CONFIG,
      useFactory: () =>
        mergeViewerConfigs(
          inject(EMBEDPDF_VIEWER_DEFAULT_CONFIG, {
            optional: true,
            skipSelf: true,
          }),
          config,
        ),
    },
  ]
}

/**
 * Provides shared viewer defaults for environment injectors such as
 * `bootstrapApplication(...)` or route-level `providers`.
 *
 * Use this helper when you want app-wide defaults with Angular's ergonomic
 * environment-provider API. Use {@link provideEmbedPdfViewerConfig} when you need
 * the same merging behavior inside a component or another local injector.
 */
export function provideEmbedPdfViewerDefaults(
  config: PDFViewerConfig,
): EnvironmentProviders {
  return makeEnvironmentProviders(provideEmbedPdfViewerConfig(config))
}

/**
 * Merges a base config with a more local override config.
 *
 * This is used both for provider-level defaults and for combining injected defaults
 * with the `PDFViewer` component's `[config]` input.
 */
export function mergeViewerConfigs(
  baseConfig: PDFViewerConfig | null | undefined,
  overrideConfig: PDFViewerConfig | null | undefined,
): PDFViewerConfig {
  return mergeRecord(
    (baseConfig ?? EMPTY_CONFIG) as ConfigRecord,
    (overrideConfig ?? EMPTY_CONFIG) as ConfigRecord,
  ) as PDFViewerConfig
}

function mergeRecord(baseValue: ConfigRecord, overrideValue: ConfigRecord): ConfigRecord {
  const merged: ConfigRecord = { ...baseValue }

  for (const [key, value] of Object.entries(overrideValue)) {
    if (value === undefined) continue

    const existingValue = merged[key]

    if (isPlainObject(existingValue) && isPlainObject(value)) {
      merged[key] = mergeRecord(existingValue, value)
      continue
    }

    if (Array.isArray(value)) {
      merged[key] = [...value]
      continue
    }

    merged[key] = value
  }

  return merged
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}
