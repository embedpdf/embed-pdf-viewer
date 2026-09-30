import { RenderLayer } from '@embedpdf/react/render';
import { Stage, useStageEvent } from '@embedpdf/react/stage';
import { analytics } from './analytics';

export function Reader() {
  useStageEvent(
    (stage) => stage.onPageChanged,
    ({ pageIndex }) => analytics.track('page_view', { page: pageIndex + 1 }),
  );

  return <Stage>{() => <RenderLayer />}</Stage>;
}
