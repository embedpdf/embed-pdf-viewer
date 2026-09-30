import { RenderLayer } from '@embedpdf/react/render';
import { Stage } from '@embedpdf/react/stage';
import { ThumbsToken } from './thumbs-token';

export function Thumbnails() {
  return (
    <Stage token={ThumbsToken} interaction={false}>
      {() => <RenderLayer />}
    </Stage>
  );
}
