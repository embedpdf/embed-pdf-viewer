/**
 * Control characters, and the bidi controls a name can use to look like
 * another: with a right-to-left override (U+202E) where `[RLO]` stands,
 * `invoice[RLO]fdp.exe` shows as `invoiceexe.pdf`.
 */
// eslint-disable-next-line no-control-regex -- finding control characters is its job
const HIDDEN = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;

/**
 * A file's name as a person may see it and save it: without control
 * characters and bidi controls, trimmed. `attachment` when nothing is left.
 */
export function displayNameOf(file: { readonly name: string }): string {
  return file.name.replace(HIDDEN, '').trim() || 'attachment';
}
