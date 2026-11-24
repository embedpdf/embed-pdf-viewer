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

/**
 * The version long-term validation arrived in on the wire: the routes that
 * read and store a document's validation data, their kind of audit row, and
 * a prepare with no field. A client uses none of them with an older server.
 */
export const VALIDATION_INFO_SINCE = '3.3';

/**
 * The version a signature field's mark may be a PNG or a JPEG in, and may be
 * taken out with `null`, on the wire: in the `appearance` part of a visual
 * fill, of a prepare and of the change op `forms.setSignatureAppearance`. A
 * client sends neither to an older server, which takes a one-page PDF only.
 */
export const MARK_IMAGE_OR_NONE_SINCE = '3.4';

/**
 * The version a form field's `purpose` and `format` arrived in on the wire:
 * in the draft of a create and the patch of an update, as a route's body and
 * as a change op. A client sends neither to an older server, whose request
 * schemas refuse a member they don't know. Reading needs no such check: an
 * older server's field is read without them (`FormFieldDTOSchema`).
 */
export const FIELD_PURPOSE_AND_FORMAT_SINCE = '3.4';

const isOlder = (version: ApiVersion, than: ApiVersion): boolean =>
  version.major < than.major || (version.major === than.major && version.minor < than.minor);

/**
 * Whether the other side lacks something that arrived in the version
 * `since`. `version` is what the other side said it speaks
 * (`EmbedPDF-Version`, `EmbedPDF-Server-Version`); `null` when it didn't
 * say, which reads as this build's own version. `since` is `null` for
 * something this build doesn't have itself.
 *
 * A side of this build's version has exactly what this build has, and a
 * newer side has all of it. So `since` is compared only with an older side's
 * version, and two sides of one build talk even while something names a
 * version the packages don't carry yet. What this build doesn't have, only a
 * newer side can have.
 */
export function lacksWhatArrivedIn(version: string | null, since: string | null): boolean {
  const own = parseApiVersion(API_VERSION)!;
  const other = (version === null ? null : parseApiVersion(version)) ?? own;
  if (since === null) return !isOlder(own, other);
  const arrived = parseApiVersion(since);
  if (!arrived) throw new Error(`not an API version: ${since}`);
  return isOlder(other, own) && isOlder(other, arrived);
}
