import { useEffect } from 'react';
import { RenderLayer } from '@embedpdf/react/render';
import { Stage, useStage, useStageState } from '@embedpdf/react/stage';
import { ThumbsToken } from './thumbnail-strip-token';

export function Thumbnails() {
  const main = useStage();
  const thumbs = useStage(ThumbsToken);
  const { currentPageIndex } = useStageState();

  // Keep the current page's thumbnail in view as the reader moves
  useEffect(() => {
    thumbs.reveal(currentPageIndex);
  }, [thumbs, currentPageIndex]);

  return (
    <Stage
      token={ThumbsToken}
      interaction={false}
      zoomGestures={false}
      pageChrome={(page) => <span className="label">{page.pageIndex + 1}</span>}
    >
      {(page) => (
        <button
          onClick={() => main.goToPage(page.ref)}
          aria-current={page.pageIndex === currentPageIndex}
        >
          <RenderLayer />
        </button>
      )}
    </Stage>
  );
}
