/**
 * A change to {@link CustomMetadata}, where every key is a field of its own:
 *
 *   key left out -> the key stays as it is
 *   null         -> remove the key
 *   "..."        -> set the key to this value (`''` is a value)
 *
 * A key is 1 to 127 printable ASCII characters, doesn't start with `/`, and
 * isn't a standard key (`Title`, `CreationDate`, …). Any other key is
 * `InvalidArg` naming it, and nothing is written.
 */
export type CustomMetadataPatch = Record<string, string | null>;
