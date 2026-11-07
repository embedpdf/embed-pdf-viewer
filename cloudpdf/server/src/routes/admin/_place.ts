/**
 * The top level has no folder row: the database stores NULL and the wire
 * spells it `root`, in records, bodies and query strings alike, so any
 * place a client reads it can pass back.
 */
export const ROOT_PLACE = 'root';

/** A wire place to a folder id, `null` for the top level. */
export function folderIdOfPlace(place: string): string | null {
  return place === ROOT_PLACE ? null : place;
}

export function placeOfFolderId(folderId: string | null): string {
  return folderId ?? ROOT_PLACE;
}
