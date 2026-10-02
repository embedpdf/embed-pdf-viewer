import { PageView } from '@embedpdf/react/page-view';
import { RenderLayer } from '@embedpdf/react/render';

export const FirstPage = () => (
  <PageView page={0} width={320}>
    <RenderLayer />
  </PageView>
);
