import { UI_ATTRIBUTES } from './consts';

export interface UIItemLike {
  id: string;
  categories?: string[];
}

export interface UIItemProps {
  [UI_ATTRIBUTES.ITEM]: string;
  [UI_ATTRIBUTES.CATEGORIES]?: string;
}

/**
 * Get data attribute props for a UI item.
 * Spread these onto the wrapper element for CSS-based visibility control.
 */
export function getUIItemProps<
  T extends Record<string, string | undefined> = Record<string, never>,
>(item: UIItemLike, extra?: T): UIItemProps & T {
  const props = {
    [UI_ATTRIBUTES.ITEM]: item.id,
    [UI_ATTRIBUTES.CATEGORIES]: item.categories?.join(' ') || undefined,
    ...extra,
  } as UIItemProps & T;

  return props;
}
