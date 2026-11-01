/**
 * The Measure bar's scale button: the current page's drawing scale, which opens and closes the
 * measurement panel. Drawn as every bar button is (the toolbar's recipe), so the Measure bar
 * stands as tall as the others. Apart from the panel and the calibration dialog
 * (measurement.tsx), so the bar draws it without loading them.
 */
import { useT } from '@embedpdf/react/i18n';
import { usePageScale } from '@embedpdf/react/measurement';
import { useSelector } from '@embedpdf/react/runtime';
import { useSurface } from '@embedpdf/react/shell';
import { StageToken } from '@embedpdf/react/stage';

import { Icon } from './icons';
import { buttonClass, buttonPart } from './toolbar';

export function MeasurementScaleButton() {
  const t = useT();

  const page = useSelector(StageToken, (stage) => stage.getCurrentPage());
  const scale = usePageScale(page);

  const surface = useSurface('measurement');
  return (
    <button
      type="button"
      part={buttonPart(surface.isOpen)}
      className={buttonClass(surface.isOpen)}
      aria-pressed={surface.isOpen || undefined}
      onClick={() => surface.toggle()}
      title={t('measurement.title')}
    >
      <span className="flex items-center whitespace-nowrap text-sm">
        <Icon name="updateScale" size={20} className="me-1.5 shrink-0" />
        <span>
          {t('measurement.scale')}:{' '}
          {scale?.measure?.subtype === 'rectilinear'
            ? (scale.measure.ratio ?? t('measurement.custom'))
            : t('measurement.unavailable')}
        </span>
      </span>
    </button>
  );
}
