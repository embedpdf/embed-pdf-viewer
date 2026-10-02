import { AnnotationDraftMenu, useAnnotation } from '@embedpdf/react/annotation';

export function DraftMenu() {
  const annotation = useAnnotation();

  return (
    <AnnotationDraftMenu>
      {(draft) => (
        <>
          <button disabled={!draft.canFinish} onClick={() => annotation.draft.finish()}>
            Done
          </button>
          <button onClick={() => annotation.draft.cancel()}>Cancel</button>
        </>
      )}
    </AnnotationDraftMenu>
  );
}
