/**
 * The Measure bar's scale button: the current page's drawing scale, which opens the measurement
 * panel. Apart from the panel and the calibration dialog (measurement.tsx), so the bar draws it
 * without loading them.
 */
import { useT } from '@embedpdf/react/i18n';
import { usePageScale } from '@embedpdf/react/measurement';
import { useSelector } from '@embedpdf/react/runtime';
import { useSurface } from '@embedpdf/react/shell';
import { StageToken } from '@embedpdf/react/stage';

import { Icon } from './icons';

const button =
  'border-border text-fg hover:bg-hover rounded-md border px-3 py-1.5 text-sm disabled:opacity-50';

export function MeasurementScaleButton() {
  const t = useT();

  const page = useSelector(StageToken, (stage) => stage.getCurrentPage());
  const scale = usePageScale(page);

  const surface = useSurface('measurement');
  return (
    <button
      part="toolbar-button"
      className={`${button} inline-flex items-center gap-1.5 whitespace-nowrap`}
      onClick={() => surface.open()}
      title={t('measurement.title')}
    >
      <Icon name="updateScale" size={20} className="shrink-0" />
      <span>
        {t('measurement.scale')}:{' '}
        {scale?.measure?.subtype === 'rectilinear'
          ? (scale.measure.ratio ?? t('measurement.custom'))
          : t('measurement.unavailable')}
      </span>
    </button>
  );
}
