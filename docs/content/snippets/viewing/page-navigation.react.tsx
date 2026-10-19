import { useStage, useStageState } from '@embedpdf/react/stage';

export function PageNavigation() {
  const stage = useStage();
  const { currentPageIndex, pageCount } = useStageState();

  return (
    <nav>
      <button onClick={() => stage.previousPage()}>Previous</button>
      <span>
        {currentPageIndex + 1} of {pageCount}
      </span>
      <button onClick={() => stage.nextPage()}>Next</button>
    </nav>
  );
}
