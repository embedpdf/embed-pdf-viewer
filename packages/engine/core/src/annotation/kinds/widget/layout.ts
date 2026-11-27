/**
 * A widget row as something older than `layout` wrote it (an older server's
 * answer, a bundle kept from an earlier version), made whole: a push
 * button's widget shows its caption alone, the PDF's default, and every
 * other widget has no layout. A row that has one comes back as it is. It
 * reads a row as it comes, not yet checked, so it takes nothing for granted.
 */
export function withWidgetLayout<Row extends Record<string, unknown>>(row: Row): Row {
  if (row.layout !== undefined) return row;
  return { ...row, layout: row.fieldKind === 'pushbutton' ? 'caption' : null };
}
