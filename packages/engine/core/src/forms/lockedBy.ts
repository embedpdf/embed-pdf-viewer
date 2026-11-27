/**
 * A field as something older than `lockedBy` wrote it (an older server's
 * answer, a bundle kept from an earlier version), made whole: it names no
 * lock, since nothing older read one. A field that has it comes back as it
 * is.
 */
export function withLockedBy<Field extends Record<string, unknown>>(field: Field): Field {
  return field.lockedBy === undefined ? { ...field, lockedBy: null } : field;
}
