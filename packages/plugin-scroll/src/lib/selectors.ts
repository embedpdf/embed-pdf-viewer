import { ScrollerLayout, ScrollDocumentState } from './types';

export const getScrollerLayout = (
  documentState: ScrollDocumentState,
  scale: number,
  elevatedPages?: Set<number>,
): ScrollerLayout => {
  return {
    startSpacing: documentState.startSpacing,
    endSpacing: documentState.endSpacing,
    totalWidth: documentState.totalContentSize.width * scale,
    totalHeight: documentState.totalContentSize.height * scale,
    pageGap: documentState.pageGap * scale,
    strategy: documentState.strategy,
    items: documentState.renderedPageIndexes.map((idx) => {
      return {
        ...documentState.virtualItems[idx],
        pageLayouts: documentState.virtualItems[idx].pageLayouts.map((layout) => {
          return {
            ...layout,
            rotatedWidth: layout.rotatedWidth * scale,
            rotatedHeight: layout.rotatedHeight * scale,
            width: layout.width * scale,
            height: layout.height * scale,
            elevated: elevatedPages?.has(layout.pageIndex) ?? false,
          };
        }),
      };
    }),
  };
};
