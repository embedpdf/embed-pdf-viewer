import { InjectionToken, Provider, inject } from '@angular/core'
import type { PDFViewerConfig } from '@embedpdf/snippet'

export const EMBEDPDF_VIEWER_DEFAULT_CONFIG = new InjectionToken<PDFViewerConfig>(
  'EMBEDPDF_VIEWER_DEFAULT_CONFIG',
)

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

export function mergeViewerConfigs(
  baseConfig: PDFViewerConfig | null | undefined,
  overrideConfig: PDFViewerConfig | null | undefined,
): PDFViewerConfig {
  return mergeRecord(baseConfig ?? {}, overrideConfig ?? {}) as PDFViewerConfig
}

function mergeRecord(baseValue: object, overrideValue: object): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...baseValue }

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
