import { useEffect, useRef, useState } from 'react';
import { useCapability, useSelector } from '@embedpdf/react/runtime';
import { AnnotationToken } from '@embedpdf/react/annotation';
import { StageToken } from '@embedpdf/react/stage';
import { useSurface } from '@embedpdf/react/shell';
import {
  MeasurementToken,
  useMeasurement,
  usePageScale,
  type LengthUnit,
} from '@embedpdf/react/measurement';
import { useT } from '@embedpdf/react/i18n';

const control =
  'border-border bg-surface text-fg w-full rounded-md border px-2 py-1.5 text-sm disabled:opacity-50';

const button =
  'border-border text-fg hover:bg-hover rounded-md border px-3 py-1.5 text-sm disabled:opacity-50';

const useCurrentPon = () => useSelector(StageToken, (c) => c.pages()[c.currentPage()]?.pon ?? -1);

export function MeasurementScaleButton() {
  const t = useT();

  const pon = useCurrentPon();
  const scale = usePageScale(pon);

  const surface = useSurface('measurement');
  return (
    <button
      className={button}
      onClick={() => surface.open({ exclusive: 'right' })}
      title={t('measurement.title')}
    >
      {t('measurement.scale')}:{' '}
      {scale.measure?.subtype === 'RL'
        ? (scale.measure.ratio ?? t('measurement.custom'))
        : t('measurement.unavailable')}
    </button>
  );
}

export function MeasurementSection() {
  const t = useT();

  const pon = useCurrentPon();

  const measurement = useMeasurement();

  const scale = usePageScale(pon);
  const anno = useCapability(AnnotationToken);
  const selected = useSelector(AnnotationToken, (c) => c.selection());
  const readouts = useSelector(
    MeasurementToken,
    (c) =>
      anno
        .getSelected()
        .map((d) => c.readout(d.ref))
        .filter((r) => !('unavailable' in r)),
    (a, b) => JSON.stringify(a) === JSON.stringify(b),
  );
  const reports = useSelector(MeasurementToken, (c) => c.lastReports());
  const [allPages, setAllPages] = useState(false);

  const [recalculate, setRecalculate] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const disabled = measurement.busy || !measurement.canCalibratePage || !scale.ready;
  const rectilinear = scale.measure?.subtype === 'RL' ? scale.measure : null;
  const options = { allPages, recalculate };
  const run = async (work: () => Promise<unknown>) => {
    setError(null);
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const precision = rectilinear?.distance[rectilinear.distance.length - 1]?.precision ?? 100;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 text-sm">
      <p className="text-fg-muted">{t('measurement.instructions')}</p>
      <div>
        <span className="text-fg-muted">{t('measurement.scale')}: </span>
        <strong>{rectilinear?.ratio ?? t('measurement.unavailable')}</strong>
      </div>
      {scale.error && (
        <p role="alert" className="text-red-600">
          {scale.error.message}
        </p>
      )}
      {!scale.persistent && scale.ready && (
        <p className="text-fg-muted">{t('measurement.sessionOnly')}</p>
      )}
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={allPages}
          disabled={measurement.busy}
          onChange={(e) => setAllPages(e.target.checked)}
        />
        {t('measurement.allPages')}
      </label>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={recalculate}
          disabled={measurement.busy}
          onChange={(e) => setRecalculate(e.target.checked)}
        />
        {t('measurement.recalculate')}
      </label>
      <label>
        {t('measurement.preset')}
        <select
          aria-label={t('measurement.preset')}
          className={control}
          value=""
          disabled={disabled}
          onChange={(e) => void run(() => measurement.setPreset(pon, e.target.value, options))}
        >
          <option value="" disabled>
            {t('measurement.choosePreset')}
          </option>
          {measurement.presets().map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t('measurement.unit')}
        <select
          aria-label={t('measurement.unit')}
          className={control}
          value={rectilinear?.distance[0]?.unit.trim() ?? ''}
          disabled={disabled || !rectilinear}
          onChange={(e) =>
            void run(() =>
              measurement.setUnit(pon, e.target.value as LengthUnit, undefined, options),
            )
          }
        >
          {!measurement.units().includes(rectilinear?.distance[0]?.unit.trim() as LengthUnit) && (
            <option value={rectilinear?.distance[0]?.unit.trim() ?? ''}>
              {t('measurement.custom')}
            </option>
          )}
          {measurement.units().map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t('measurement.precision')}
        <select
          aria-label={t('measurement.precision')}
          className={control}
          value={precision}
          disabled={disabled || !rectilinear}
          onChange={(e) =>
            void run(() => measurement.setPrecision(pon, Number(e.target.value), options))
          }
        >
          {![1, 10, 100, 1000, 10000].includes(precision) && (
            <option value={precision}>{t('measurement.custom')}</option>
          )}
          {[1, 10, 100, 1000, 10000].map((p) => (
            <option key={p} value={p}>
              {1 / p}
            </option>
          ))}
        </select>
      </label>
      <button className={button} disabled={disabled} onClick={() => measurement.startCalibration()}>
        {t('measurement.calibrate')}
      </button>
      {selected.length > 0 && (
        <section className="border-border-subtle border-t pt-3">
          <h3 className="mb-1 font-medium">{t('measurement.selection')}</h3>
          {readouts.length ? (
            readouts.map((r, i) => <p key={i}>{'label' in r ? r.label : ''}</p>)
          ) : (
            <p className="text-fg-muted">{t('measurement.unavailable')}</p>
          )}
        </section>
      )}
      {reports.length > 0 && (
        <p role="status">
          {t('measurement.report', {
            params: {
              updated: reports.reduce((n, r) => n + r.updated.length, 0),
              skipped: reports.reduce((n, r) => n + r.skipped.length, 0),
              failed: reports.reduce(
                (n, r) => n + r.failed.length + (r.scaleError || r.error ? 1 : 0),
                0,
              ),
            },
          })}
        </p>
      )}
      {error && (
        <p role="alert" className="text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

export function CalibrationDialog() {
  const t = useT();

  const measurement = useMeasurement();
  const request = useSelector(MeasurementToken, (c) => c.calibrationRequest());
  const input = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');

  const [unit, setUnit] = useState<LengthUnit>('m');
  const [allPages, setAllPages] = useState(false);

  const [recalculate, setRecalculate] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setValue('');
    setError(null);
    input.current?.focus();
  }, [request]);
  if (!request) return null;
  const submit = async () => {
    setError(null);
    try {
      await measurement.calibrate(
        request.pon,
        request.from,
        request.to,
        { value: Number(value), unit },
        { allPages, recalculate },
      );
      measurement.dismissCalibration();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !measurement.busy) measurement.dismissCalibration();
      }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="measurement-calibration-title"
        className="border-border bg-surface flex w-96 flex-col gap-4 rounded-lg border p-5 shadow-xl"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <h2 id="measurement-calibration-title" className="font-semibold">
          {t('measurement.calibrate')}
        </h2>
        <p className="text-fg-muted text-sm">{t('measurement.knownLength')}</p>
        <label>
          {t('measurement.length')}
          <input
            ref={input}
            aria-label={t('measurement.length')}
            className={control}
            type="number"
            min="0"
            step="any"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </label>
        <label>
          {t('measurement.unit')}
          <select
            className={control}
            aria-label={t('measurement.unit')}
            value={unit}
            onChange={(e) => setUnit(e.target.value as LengthUnit)}
          >
            {measurement.units().map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={allPages}
            onChange={(e) => setAllPages(e.target.checked)}
          />
          {t('measurement.allPages')}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={recalculate}
            onChange={(e) => setRecalculate(e.target.checked)}
          />
          {t('measurement.recalculate')}
        </label>
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className={button}
            disabled={measurement.busy}
            onClick={() => measurement.dismissCalibration()}
          >
            {t('demo.cancel')}
          </button>
          <button
            className={button}
            type="submit"
            disabled={
              measurement.busy ||
              !measurement.canCalibratePage ||
              !(Number(value) > 0) ||
              !Number.isFinite(Number(value))
            }
          >
            {measurement.busy ? t('measurement.applying') : t('measurement.apply')}
          </button>
        </div>
      </form>
    </div>
  );
}
