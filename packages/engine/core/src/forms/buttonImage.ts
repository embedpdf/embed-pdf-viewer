/**
 * A field as something older than `hasImage` wrote it (an older server's
 * answer, a bundle kept from an earlier version), made whole: a push button
 * holds no image, since nothing older could put one in through the engine.
 * Any other field, and a push button that says, comes back as it is. It
 * reads a field as it comes, not yet checked, so it takes nothing for
 * granted.
 */
export function withButtonImage<Field extends Record<string, unknown>>(field: Field): Field {
  if (field.kind !== 'pushbutton' || field.hasImage !== undefined) return field;
  return { ...field, hasImage: false };
}
