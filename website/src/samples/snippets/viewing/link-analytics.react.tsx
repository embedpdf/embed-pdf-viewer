import { LinkLayer, useLinkEvent } from '@embedpdf/react/link';
import { RenderLayer } from '@embedpdf/react/render';
import { Stage } from '@embedpdf/react/stage';
import { analytics } from './analytics';

export function Reader() {
  useLinkEvent(
    (link) => link.onActivated,
    ({ target }) => analytics.track('link_followed', { kind: target.kind }),
  );

  return (
    <Stage>
      {() => (
        <>
          <RenderLayer />
          <LinkLayer />
        </>
      )}
    </Stage>
  );
}
