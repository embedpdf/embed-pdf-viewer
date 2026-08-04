import { h } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import {
  PdfMeasurementUnit,
  PdfMeasurementScale,
  formatNumber,
  unitLabel,
  DEFAULT_MEASUREMENT_SCALE,
} from '@embedpdf/models';
import { useAnnotationCapability } from '@embedpdf/plugin-annotation/preact';
import { useTranslations } from '@embedpdf/plugin-i18n/preact';
import { Dialog } from './ui/dialog';
import { Button } from './ui/button';

interface CalibrationModalProps {
  documentId: string;
  isOpen?: boolean;
  onClose?: () => void;
  onExited?: () => void;
  /**
   * Page-point distance from a draw-to-calibrate line. When present the
   * "Page distance" field is prefilled with it and the real-length field is
   * focused, so the user only types the known length and presses Enter.
   */
  drawnPagePoints?: number;
}

const UNIT_VALUES = Object.values(PdfMeasurementUnit) as PdfMeasurementUnit[];

const SELECT_CLASS =
  'border-border-default bg-bg-input text-fg-primary focus:border-accent focus:ring-accent w-full rounded-md border px-3 py-1 text-base focus:outline-none focus:ring-1';
const INPUT_CLASS = SELECT_CLASS;

export function CalibrationModal({
  documentId,
  isOpen,
  onClose,
  onExited,
  drawnPagePoints,
}: CalibrationModalProps) {
  const { provides: annotation } = useAnnotationCapability();
  const { translate } = useTranslations(documentId);

  const [pagePoints, setPagePoints] = useState<number>(DEFAULT_MEASUREMENT_SCALE.pagePoints);
  const [value, setValue] = useState<number>(DEFAULT_MEASUREMENT_SCALE.value);
  const [unit, setUnit] = useState<PdfMeasurementUnit>(DEFAULT_MEASUREMENT_SCALE.unit);
  const valueInputRef = useRef<HTMLInputElement>(null);

  // Seed the form from the current calibration whenever the dialog opens.
  // If we arrived from a drawn calibration line, prefill the page distance
  // from it and focus the real-length field so Enter applies immediately.
  useEffect(() => {
    if (!isOpen) return;
    const current = annotation?.getMeasurementScale() ?? DEFAULT_MEASUREMENT_SCALE;
    const hasDrawn = typeof drawnPagePoints === 'number' && drawnPagePoints > 0;
    setPagePoints(hasDrawn ? Math.round(drawnPagePoints! * 100) / 100 : current.pagePoints);
    setValue(current.value);
    setUnit(current.unit);
    if (hasDrawn) {
      requestAnimationFrame(() => valueInputRef.current?.select());
    }
  }, [isOpen, drawnPagePoints]);

  const valid = pagePoints > 0 && value > 0 && Number.isFinite(pagePoints) && Number.isFinite(value);

  const apply = () => {
    if (!annotation || !valid) return;
    const scale: PdfMeasurementScale = { value, unit, pagePoints };
    annotation.setMeasurementScale(scale);
    onClose?.();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && valid) {
      e.preventDefault();
      apply();
    }
  };

  return (
    <Dialog
      open={isOpen ?? false}
      title={translate('measurement.calibrateTitle')}
      onClose={onClose}
      onExited={onExited}
      className="md:w-[32rem]"
    >
      <div className="space-y-6">
        <p className="text-fg-secondary text-sm">{translate('measurement.calibrateIntro')}</p>

        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="text-fg-secondary mb-1 block text-sm font-medium">
              {translate('measurement.pagePoints')}
            </label>
            <input
              type="number"
              min={1}
              step="any"
              value={pagePoints}
              onInput={(e) => setPagePoints(parseFloat((e.target as HTMLInputElement).value))}
              onKeyDown={onKeyDown}
              className={INPUT_CLASS}
            />
          </div>
          <span className="text-fg-muted pb-2 text-sm">=</span>
          <div className="flex-1">
            <label className="text-fg-secondary mb-1 block text-sm font-medium">
              {translate('measurement.realValue')}
            </label>
            <input
              ref={valueInputRef}
              type="number"
              min={0}
              step="any"
              value={value}
              onInput={(e) => setValue(parseFloat((e.target as HTMLInputElement).value))}
              onKeyDown={onKeyDown}
              className={INPUT_CLASS}
            />
          </div>
          <div className="flex-1">
            <label className="text-fg-secondary mb-1 block text-sm font-medium">
              {translate('measurement.unit')}
            </label>
            <select
              className={SELECT_CLASS}
              value={unit}
              onChange={(e) => setUnit((e.target as HTMLSelectElement).value as PdfMeasurementUnit)}
            >
              {UNIT_VALUES.map((u) => (
                <option key={u} value={u}>
                  {unitLabel(u, false)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {valid && (
          <div className="bg-state-info-light text-fg-secondary rounded-md p-3 text-sm">
            {translate('measurement.preview')}: {pagePoints} pt ={' '}
            {formatNumber(value, { type: 'decimal', places: 2 })} {unitLabel(unit, false)}
          </div>
        )}

        <div className="border-border-subtle flex justify-end space-x-3 border-t pt-4">
          <Button
            onClick={onClose}
            className="border-border-default bg-bg-surface text-fg-secondary hover:bg-interactive-hover rounded-md border px-4 py-2 text-sm"
          >
            {translate('measurement.cancel')}
          </Button>
          <Button
            onClick={apply}
            disabled={!valid}
            className="bg-accent text-fg-on-accent hover:!bg-accent-hover rounded-md border border-transparent px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            {translate('measurement.apply')}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
