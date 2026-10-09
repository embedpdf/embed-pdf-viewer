import { RenderLayer, useRenderEvent } from '@embedpdf/react/render';
import { Stage } from '@embedpdf/react/stage';
import { refreshMyPreviews } from './previews';

export function Reader() {
  useRenderEvent(
    (render) => render.onInvalidated,
    ({ pages }) => refreshMyPreviews(pages),
  );

  return <Stage>{() => <RenderLayer />}</Stage>;
}
