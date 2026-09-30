import { useStage, useStageState } from '@embedpdf/react/stage';

export function ZoomControls() {
  const stage = useStage();
  const { zoomLevel, zoomMode } = useStageState();

  return (
    <div>
      <button onClick={() => stage.zoomOut()}>−</button>
      <span>{Math.round(zoomLevel * 100)}%</span>
      <button onClick={() => stage.zoomIn()}>+</button>
      <button onClick={() => stage.fitWidth()} aria-pressed={zoomMode === 'fit-width'}>
        Fit width
      </button>
    </div>
  );
}
