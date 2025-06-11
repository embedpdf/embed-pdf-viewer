import { ScrollerLayout, ScrollMode, ScrollState } from './types';

export const getScrollerLayout = (state: ScrollState, scale: number): ScrollerLayout => {
  if (state.mode === ScrollMode.Page) {
    const currentItem = state.virtualItems.find((item) =>
      item.pageNumbers.includes(state.currentPage),
    );

    // If for any reason the page isn't found, return an empty layout.
    if (!currentItem) {
      return {
        startSpacing: 0,
        endSpacing: 0,
        totalWidth: 0,
        totalHeight: 0,
        pageGap: 0,
        strategy: state.strategy,
        items: [],
      };
    }

    // Create a scaled version of the single active item.
    const scaledItem = {
      ...currentItem,
      pageLayouts: currentItem.pageLayouts.map((layout) => ({
        ...layout,
        rotatedWidth: layout.rotatedWidth * scale,
        rotatedHeight: layout.rotatedHeight * scale,
        width: layout.width * scale,
        height: layout.height * scale,
      })),
    };

    // Return a layout that fits the single page perfectly.
    return {
      startSpacing: 0,
      endSpacing: 0,
      totalWidth: currentItem.width * scale,
      totalHeight: currentItem.height * scale,
      pageGap: state.pageGap * scale,
      strategy: state.strategy,
      items: [scaledItem], // Provide only the single, active item to the DOM.
    };
  }

  return {
    startSpacing: state.startSpacing,
    endSpacing: state.endSpacing,
    totalWidth: state.totalContentSize.width * scale,
    totalHeight: state.totalContentSize.height * scale,
    pageGap: state.pageGap * scale,
    strategy: state.strategy,
    items: state.renderedPageIndexes.map((idx) => {
      return {
        ...state.virtualItems[idx],
        pageLayouts: state.virtualItems[idx].pageLayouts.map((layout) => {
          return {
            ...layout,
            rotatedWidth: layout.rotatedWidth * scale,
            rotatedHeight: layout.rotatedHeight * scale,
            width: layout.width * scale,
            height: layout.height * scale,
          };
        }),
      };
    }),
  };
};
