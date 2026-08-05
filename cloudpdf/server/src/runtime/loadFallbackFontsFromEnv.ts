/**
 * Build the deployment fallback-font list from environment variables.
 *
 * Convention:
 *   CLOUDPDF_FALLBACK_FONTS  JSON array of font descriptors (default: none)
 *
 * Each entry is `{ key, path, familyName?, weight?, italic?, fallback? }`:
 *
 *   CLOUDPDF_FALLBACK_FONTS='[
 *     { "key": "noto-sc", "path": "/srv/fonts/NotoSansSC-Regular.otf",
 *       "familyName": "Noto Sans SC" }
 *   ]'
 *
 * `fallback` defaults to `true` (the server use case is filling missing glyphs).
 * Paths are read by each worker on demand — they must be readable by the server
 * process. A malformed value throws so a bad font config fails fast at boot.
 */

import type { FallbackFontDescriptor } from './WorkerThreadPool';

const ENV_KEY = 'CLOUDPDF_FALLBACK_FONTS';

export function loadFallbackFontsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): FallbackFontDescriptor[] {
  const raw = env[ENV_KEY]?.trim();
  if (!raw) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`${ENV_KEY} is not valid JSON: ${(error as Error).message}`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`${ENV_KEY} must be a JSON array of font descriptors`);
  }

  return parsed.map((entry, index) => normalizeDescriptor(entry, index));
}

function normalizeDescriptor(entry: unknown, index: number): FallbackFontDescriptor {
  if (typeof entry !== 'object' || entry === null) {
    throw new Error(`${ENV_KEY}[${index}] must be an object`);
  }
  const e = entry as Record<string, unknown>;
  const key = e['key'];
  const path = e['path'];
  if (typeof key !== 'string' || key.length === 0) {
    throw new Error(`${ENV_KEY}[${index}].key is required and must be a non-empty string`);
  }
  if (typeof path !== 'string' || path.length === 0) {
    throw new Error(`${ENV_KEY}[${index}].path is required and must be a non-empty string`);
  }

  const descriptor: FallbackFontDescriptor = { key, path };
  if (typeof e['familyName'] === 'string') descriptor.familyName = e['familyName'];
  if (typeof e['weight'] === 'number') descriptor.weight = e['weight'];
  if (typeof e['italic'] === 'boolean') descriptor.italic = e['italic'];
  // Default to true: a server-configured font is for filling missing glyphs.
  descriptor.fallback = typeof e['fallback'] === 'boolean' ? e['fallback'] : true;
  return descriptor;
}
