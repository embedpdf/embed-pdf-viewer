import { useEffect, useRef, useState, HTMLAttributes, CSSProperties, ReactNode } from '@framework';
import { WindowState } from '@embedpdf/plugin-thumbnail';
import { useThumbnailPlugin } from '../hooks';

type ThumbnailsProps = Omit<HTMLAttributes<HTMLDivElement>, 'style' | 'children'> & {
  /**
   * The ID of the document that this thumbnail pane displays
   */
  documentId: string;
  style?: CSSProperties;
  children: (m: any) => ReactNode;
};

export function ThumbnailsPane({ documentId, style, children, ...props }: ThumbnailsProps) {
  const { plugin: thumbnailPlugin } = useThumbnailPlugin();
  const viewportRef = useRef<HTMLDivElement>(null);

  // Store window data along with the documentId it came from
  const [windowData, setWindowData] = useState<{
    window: WindowState | null;
    docId: string | null;
  }>({ window: null, docId: null });

  // Only use the window if it matches the current documentId
  const window = windowData.docId === documentId ? windowData.window : null;

  // 1) subscribe to window updates for this document
  useEffect(() => {
    if (!thumbnailPlugin) return;
    const scope = thumbnailPlugin.provides().forDocument(documentId);

    // Get initial window state immediately on mount
    const initialWindow = scope.getWindow();

    if (initialWindow) {
      setWindowData({ window: initialWindow, docId: documentId });
    }

    // Subscribe to future updates
    const unsubscribe = scope.onWindow((newWindow) => {
      setWindowData({ window: newWindow, docId: documentId });
    });

    // Clear state when documentId changes or component unmounts
    return () => {
      unsubscribe();
      setWindowData({ window: null, docId: null });
    };
  }, [thumbnailPlugin, documentId]);

  // 2) keep plugin in sync while the user scrolls
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp || !thumbnailPlugin) return;
    const scope = thumbnailPlugin.provides().forDocument(documentId);
    const onScroll = () => scope.updateWindow(vp.scrollTop, vp.clientHeight);
    vp.addEventListener('scroll', onScroll);
    return () => vp.removeEventListener('scroll', onScroll);
  }, [thumbnailPlugin, documentId]);

  // 2.5) keep plugin in sync when viewport resizes
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp || !thumbnailPlugin) return;

    const scope = thumbnailPlugin.provides().forDocument(documentId);
    const resizeObserver = new ResizeObserver(() => {
      scope.updateWindow(vp.scrollTop, vp.clientHeight);
    });
    resizeObserver.observe(vp);

    return () => resizeObserver.disconnect();
  }, [thumbnailPlugin, documentId]);

  // 3) kick-start after document change
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp || !thumbnailPlugin) return;

    const scope = thumbnailPlugin.provides().forDocument(documentId);
    scope.updateWindow(vp.scrollTop, vp.clientHeight);
  }, [window, thumbnailPlugin, documentId]);

  // 4) let plugin drive scroll
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp || !thumbnailPlugin || !window) return;

    const scope = thumbnailPlugin.provides().forDocument(documentId);
    return scope.onScrollTo(({ top, behavior }) => {
      vp.scrollTo({ top, behavior });
    });
  }, [thumbnailPlugin, documentId, !!window]);

  const paddingY = thumbnailPlugin?.cfg.paddingY ?? 0;

  return (
    <div
      ref={viewportRef}
      style={{
        overflowY: 'auto',
        position: 'relative',
        paddingTop: paddingY,
        paddingBottom: paddingY,
        height: '100%',
        ...style,
      }}
      {...props}
    >
      <div style={{ height: window?.totalHeight ?? 0, position: 'relative' }}>
        {window?.items.map((m) => children(m))}
      </div>
    </div>
  );
}
