import { ReactNode, useEffect, useState, HTMLAttributes, useLayoutEffect } from '@framework';
import { ScrollStrategy, ScrollerLayout, PageLayout } from '@embedpdf/plugin-scroll';
import { useRegistry } from '@embedpdf/core/@framework';
import { PdfDocumentObject, Rotation } from '@embedpdf/models';

import { useScrollPlugin } from '../hooks';

export interface RenderPageProps extends PageLayout {
  rotation: Rotation;
  scale: number;
  document: PdfDocumentObject | null;
}

type ScrollerProps = HTMLAttributes<HTMLDivElement> & {
  documentId: string;
  renderPage: (props: RenderPageProps) => ReactNode;
};

export function Scroller({ documentId, renderPage, ...props }: ScrollerProps) {
  const { plugin: scrollPlugin } = useScrollPlugin();
  const { registry } = useRegistry();
  const [layoutData, setLayoutData] = useState<{
    layout: ScrollerLayout | null;
    docId: string | null;
  }>({ layout: null, docId: null });

  const targetDocId = documentId;

  useEffect(() => {
    if (!scrollPlugin || !documentId) return;

    // When we get new data, store it along with the current documentId
    const unsubscribe = scrollPlugin.onScrollerData(documentId, (newLayout) => {
      setLayoutData({ layout: newLayout, docId: documentId });
    });

    // When the component unmounts or documentId changes, clear the state
    return () => {
      unsubscribe();
      setLayoutData({ layout: null, docId: null });
      scrollPlugin.clearLayoutReady(documentId);
    };
  }, [scrollPlugin, documentId]);

  const scrollerLayout = layoutData.docId === documentId ? layoutData.layout : null;

  useLayoutEffect(() => {
    if (!scrollPlugin || !documentId || !scrollerLayout) return;

    scrollPlugin.setLayoutReady(documentId);
  }, [scrollPlugin, documentId, scrollerLayout]);

  if (!scrollerLayout) return null;
  if (!registry) return null;

  const coreState = registry.getStore().getState();
  const coreDoc = coreState.core.documents[targetDocId];

  if (!coreDoc) return null;

  return (
    <div
      {...props}
      style={{
        width: `${scrollerLayout.totalWidth}px`,
        height: `${scrollerLayout.totalHeight}px`,
        position: 'relative',
        boxSizing: 'border-box',
        margin: '0 auto',
        ...(scrollerLayout.strategy === ScrollStrategy.Horizontal && {
          display: 'flex',
          flexDirection: 'row',
        }),
      }}
    >
      <div
        style={{
          ...(scrollerLayout.strategy === ScrollStrategy.Horizontal
            ? {
                width: scrollerLayout.startSpacing,
                height: '100%',
                flexShrink: 0,
              }
            : {
                height: scrollerLayout.startSpacing,
                width: '100%',
              }),
        }}
      />
      <div
        style={{
          gap: scrollerLayout.pageGap,
          display: 'flex',
          alignItems: 'center',
          position: 'relative',
          boxSizing: 'border-box',
          ...(scrollerLayout.strategy === ScrollStrategy.Horizontal
            ? {
                flexDirection: 'row',
                minHeight: '100%',
              }
            : {
                flexDirection: 'column',
                minWidth: 'fit-content',
              }),
        }}
      >
        {scrollerLayout.items.map((item) => (
          <div
            key={item.pageNumbers[0]}
            style={{
              display: 'flex',
              justifyContent: 'center',
              gap: scrollerLayout.pageGap,
            }}
          >
            {item.pageLayouts.map((layout) => (
              <div
                key={layout.pageNumber}
                style={{
                  width: `${layout.rotatedWidth}px`,
                  height: `${layout.rotatedHeight}px`,
                }}
              >
                {renderPage({
                  ...layout,
                  rotation: coreDoc.rotation,
                  scale: coreDoc.scale,
                  document: coreDoc.document,
                })}
              </div>
            ))}
          </div>
        ))}
      </div>
      <div
        style={{
          ...(scrollerLayout.strategy === ScrollStrategy.Horizontal
            ? {
                width: scrollerLayout.endSpacing,
                height: '100%',
                flexShrink: 0,
              }
            : {
                height: scrollerLayout.endSpacing,
                width: '100%',
              }),
        }}
      />
    </div>
  );
}
