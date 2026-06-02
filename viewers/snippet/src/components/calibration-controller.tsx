import { useEffect } from 'preact/hooks';
import { pointDistance } from '@embedpdf/models';
import { useAnnotationCapability } from '@embedpdf/plugin-annotation/preact';
import { useUICapability } from '@embedpdf/plugin-ui/preact';

interface CalibrationControllerProps {
  documentId: string;
}

/**
 * Headless glue for draw-to-calibrate. When the user finishes drawing a
 * calibration line (the `calibrate` tool emits `onCalibrationDraw`), this
 * exits draw mode and opens the calibration dialog prefilled with the drawn
 * page-point distance, so the user only types the known real-world length.
 */
export function CalibrationController({ documentId }: CalibrationControllerProps) {
  const { provides: annotation } = useAnnotationCapability();
  const { provides: ui } = useUICapability();

  useEffect(() => {
    if (!annotation || !ui) return;
    const scope = annotation.forDocument(documentId);
    const unsubscribe = scope.onCalibrationDraw(({ start, end }) => {
      const drawnPagePoints = pointDistance(start, end);
      scope.setActiveTool(null); // leave calibration draw mode
      ui.forDocument(documentId).openModal('calibration-modal', { drawnPagePoints });
    });
    return () => unsubscribe?.();
  }, [annotation, ui, documentId]);

  return null;
}
