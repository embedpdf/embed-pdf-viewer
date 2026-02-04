import {
  useAllViews,
  useViewManagerCapability,
  ViewContextRenderProps,
} from '@embedpdf/plugin-view-manager/react';
import { ViewContext } from '@embedpdf/plugin-view-manager/react';
import { ReactNode, useEffect } from 'react';

interface SplitViewLayoutProps {
  renderView: (context: ViewContextRenderProps) => ReactNode;
}

export function SplitViewLayout({ renderView }: SplitViewLayoutProps) {
  const allViews = useAllViews();
  const { provides: viewManager } = useViewManagerCapability();

  // Auto-remove empty views (except if it's the only view)
  useEffect(() => {
    if (!viewManager) return;

    const emptyViews = allViews.filter((v) => v.documentIds.length === 0);

    if (emptyViews.length > 0 && allViews.length > 1) {
      emptyViews.forEach((emptyView) => {
        if (allViews.length > 1) {
          viewManager.removeView(emptyView.id);
        }
      });
    }
  }, [allViews, viewManager]);

  const getLayoutClass = () => {
    switch (allViews.length) {
      case 1:
        return 'grid-cols-1';
      case 2:
        return 'grid-cols-2';
      case 3:
      case 4:
        return 'grid-cols-2 grid-rows-2';
      default:
        return 'grid-cols-3';
    }
  };

  return (
    <div className={`grid h-full gap-1 ${getLayoutClass()} p-1`}>
      {allViews.map((view) => (
        <ViewContext key={view.id} viewId={view.id}>
          {(context) => (
            <div
              onClick={context.focus}
              className={`relative overflow-hidden border ${
                context.isFocused ? 'border-blue-500' : 'border-gray-300'
              }`}
            >
              {renderView(context)}
            </div>
          )}
        </ViewContext>
      ))}
    </div>
  );
}
