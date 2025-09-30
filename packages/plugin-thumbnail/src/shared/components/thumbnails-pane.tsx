import { useEffect, useRef, useState, HTMLAttributes, CSSProperties, ReactNode } from '@framework';
import { ThumbMeta, WindowState } from '@embedpdf/plugin-thumbnail';
import { useThumbnailPlugin } from '../hooks';

type ThumbnailsProps = Omit<HTMLAttributes<HTMLDivElement>, 'style' | 'children'> & {
  style?: CSSProperties;
  children: (m: ThumbMeta) => ReactNode;
  /** @deprecated use scrollToThumb via capability or rely on autoScroll */
  selectedPage?: number;
  /** @deprecated behavior is now controlled by ThumbnailPluginConfig.scrollBehavior */
  scrollOptions?: ScrollIntoViewOptions;
};

export function ThumbnailsPane({ style, scrollOptions, selectedPage, ...props }: ThumbnailsProps) {
  const { plugin: thumbnailPlugin } = useThumbnailPlugin();
  const viewportRef = useRef<HTMLDivElement>(null);

  const [window, setWindow] = useState<WindowState | null>(null);

  // 1) subscribe once to window updates
  useEffect(() => thumbnailPlugin?.onWindow(setWindow), [thumbnailPlugin]);

  // 2) keep plugin in sync while the user scrolls
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const onScroll = () => thumbnailPlugin?.updateWindow(vp.scrollTop, vp.clientHeight);
    vp.addEventListener('scroll', onScroll);
    return () => vp.removeEventListener('scroll', onScroll);
  }, [thumbnailPlugin]);

  // 2.5) keep plugin in sync when viewport resizes (e.g., menu opens/closes)
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp || !thumbnailPlugin) return;

    const resizeObserver = new ResizeObserver(() => {
      thumbnailPlugin.updateWindow(vp.scrollTop, vp.clientHeight);
    });
    resizeObserver.observe(vp);

    return () => resizeObserver.disconnect();
  }, [thumbnailPlugin]);

  // 3) kick-start after document change
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp || !thumbnailPlugin) return;

    // push initial metrics
    thumbnailPlugin.updateWindow(vp.scrollTop, vp.clientHeight);
  }, [window, thumbnailPlugin]);

  // 4) let plugin drive scroll – only after window is set, and only once
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp || !thumbnailPlugin || !window) return;

    return thumbnailPlugin.onScrollTo(({ top, behavior }) => {
      vp.scrollTo({ top, behavior });
    });
  }, [thumbnailPlugin, !!window]); // Note: !!window to prevent re-subscription on window updates

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
        {window?.items.map((m) => props.children(m))}
      </div>
    </div>
  );
}
