/**
 * The form of a name that search, name sorts and sibling uniqueness
 * compare: NFC, then lowercased. Folding here rather than with SQL
 * `lower()` keeps both dialects in agreement, since SQLite's `lower()`
 * folds ASCII only.
 */
export function nameKeyOf(name: string): string {
  return name.normalize('NFC').toLowerCase();
}
