import { version } from '../../package.json';

/** An API version: the major and minor of a release. */
export interface ApiVersion {
  major: number;
  minor: number;
}

/**
 * Reads `<major>.<minor>` (`EmbedPDF-Version`, `EmbedPDF-Server-Version`).
 * Returns `null` for anything else, a patch number included.
 */
export function parseApiVersion(raw: string): ApiVersion | null {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(raw);
  return match ? { major: Number(match[1]), minor: Number(match[2]) } : null;
}

/** The API version of a package version: `3.0.0-next.22` is `3.0`. */
export function apiVersionOf(packageVersion: string): string {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.\d+/.exec(packageVersion);
  if (!match) throw new Error(`not a package version: ${packageVersion}`);
  return `${match[1]}.${match[2]}`;
}

/**
 * The API version this release speaks: what a client sends as
 * `EmbedPDF-Version` and a server answers as `EmbedPDF-Server-Version`
 * (`docs/conventions/api-evolution.md`). The engine, viewer, server and SDK
 * packages release together, so they all speak this one.
 */
export const API_VERSION: string = apiVersionOf(version);
