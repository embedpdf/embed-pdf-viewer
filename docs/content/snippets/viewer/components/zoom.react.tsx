import { Button, useCommand } from '@embedpdf/viewer-react';
import { useStageState } from '@embedpdf/react/stage';

export function ZoomPill() {
  const { zoomLevel } = useStageState();
  const fitWidth = useCommand('zoom:fit-width');

  return (
    <div className="zoom-pill">
      <Button command="zoom:out" />
      <span>{Math.round(zoomLevel * 100)}%</span>
      <Button command="zoom:in" />
      <button className="chip" aria-pressed={fitWidth.active} onClick={fitWidth.run}>
        {fitWidth.label}
      </button>
    </div>
  );
}
