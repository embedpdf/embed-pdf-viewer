import { RenderLayer } from '@embedpdf/react/render';
import { Stage } from '@embedpdf/react/stage';

export function CleanPages() {
  return <Stage>{() => <RenderLayer annotations={false} />}</Stage>;
}
