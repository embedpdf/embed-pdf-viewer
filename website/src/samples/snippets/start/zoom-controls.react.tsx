import { useStage, useStageState } from '@embedpdf/react/stage';

export function ZoomControls() {
  const stage = useStage();
  const { zoomLevel } = useStageState();

  return (
    <div>
      <button onClick={() => stage.zoomOut()}>−</button>
      <span>{Math.round(zoomLevel * 100)}%</span>
      <button onClick={() => stage.zoomIn()}>+</button>
    </div>
  );
}
