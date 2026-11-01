import { RenderLayer, usePictureState } from '@embedpdf/react/render';
import { Stage } from '@embedpdf/react/stage';

export function Pages() {
  return (
    <Stage>
      {() => (
        <>
          <RenderLayer />
          <PageLoading />
        </>
      )}
    </Stage>
  );
}

// A layer of the page: an indicator while its picture is on its way
function PageLoading() {
  const { status, slow } = usePictureState();
  if (status === 'loading' && slow) {
    return <div className="page-loading" role="status" aria-label="Loading page" />;
  }
  if (status === 'error') return <p className="page-error">This page couldn't load.</p>;
  return null;
}
