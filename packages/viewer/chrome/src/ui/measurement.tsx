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
  type AreaUnit,
  type MeasurementReadout,
} from '@embedpdf/react/measurement';
import { useT } from '@embedpdf/react/i18n';
import { Icon } from './icons';

const control =
  'border-border bg-surface text-fg w-full rounded-md border px-2 py-1.5 text-sm disabled:opacity-50';

const button =
  'border-border text-fg hover:bg-hover rounded-md border px-3 py-1.5 text-sm disabled:opacity-50';

/** The current page's address, or null with no page (empty document). */
const useCurrentPage = () =>
  useSelector(StageToken, (stage) => stage.getCurrentPage()?.ref ?? null);

export function MeasurementScaleButton() {
  const t = useT();

  const page = useCurrentPage();
  const scale = usePageScale(page);

  const surface = useSurface('measurement');
  return (
    <button
      className={`${button} inline-flex items-center gap-1.5 whitespace-nowrap`}
      onClick={() => surface.open({ exclusive: 'right' })}
      title={t('measurement.title')}
    >
      <Icon name="updateScale" size={20} className="shrink-0" />
      <span>
        {t('measurement.scale')}:{' '}
        {scale?.measure?.subtype === 'RL'
          ? (scale.measure.ratio ?? t('measurement.custom'))
          : t('measurement.unavailable')}
      </span>
    </button>
  );
}

export function MeasurementSection() {
  const t = useT();

  const page = useCurrentPage();

  const measurement = useMeasurement();
  const canCalibrate = useSelector(MeasurementToken, (current) => current.canCalibrate());

  const scale = usePageScale(page);
  const anno = useCapability(AnnotationToken);
  const selected = useSelector(AnnotationToken, (annotation) => annotation.getSelection());
  const resettable = useSelector(
    AnnotationToken,
    (annotation) =>
      annotation
        .listSelected()
        .filter(
          (candidate) =>
            (candidate.subtype === 'polygon' || candidate.subtype === 'polyline') &&
            candidate.raw &&
            (candidate.raw.subtype === 'polygon' || candidate.raw.subtype === 'polyline') &&
            candidate.raw.caption?.center &&
            annotation.canEdit(candidate.ref) &&
            !candidate.flags.lockedContents,
        ),
    (left, right) =>
      left.length === right.length && left.every((annotation, i) => annotation === right[i]),
  );
  const readouts = useSelector(
    MeasurementToken,
    (measurement) =>
      anno
        .listSelected()
        .map((annotation) => measurement.getReadout(annotation.ref))
        .filter((readout): readout is MeasurementReadout => !('unavailable' in readout)),
    (left, right) => JSON.stringify(left) === JSON.stringify(right),
  );
  const reports = useSelector(MeasurementToken, (measurement) => measurement.listLastReports());
  const [allPages, setAllPages] = useState(false);

  const [recalculate, setRecalculate] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const disabled = !page || measurement.busy || !canCalibrate || !scale?.ready;
  const rectilinear = scale?.measure?.subtype === 'RL' ? scale.measure : null;
  const target = allPages ? 'all' : page!;
  const options = { recalculate };
  const run = async (work: () => Promise<unknown>) => {
    setError(null);
    try {
      await work();
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
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
      {scale?.error && (
        <p role="alert" className="text-red-600">
          {scale.error.message}
        </p>
      )}
      {scale && !scale.persistent && scale.ready && (
        <p className="text-fg-muted">{t('measurement.sessionOnly')}</p>
      )}
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={allPages}
          disabled={measurement.busy}
          onChange={(event) => setAllPages(event.target.checked)}
        />
        {t('measurement.allPages')}
      </label>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={recalculate}
          disabled={measurement.busy}
          onChange={(event) => setRecalculate(event.target.checked)}
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
          onChange={(event) =>
            void run(() => measurement.setPreset(target, event.target.value, options))
          }
        >
          <option value="" disabled>
            {t('measurement.choosePreset')}
          </option>
          {measurement.listPresets().map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.label}
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
          onChange={(event) =>
            void run(() => measurement.setUnit(target, event.target.value as LengthUnit, options))
          }
        >
          {!measurement
            .listUnits()
            .includes(rectilinear?.distance[0]?.unit.trim() as LengthUnit) && (
            <option value={rectilinear?.distance[0]?.unit.trim() ?? ''}>
              {t('measurement.custom')}
            </option>
          )}
          {measurement.listUnits().map((unit) => (
            <option key={unit} value={unit}>
              {unit}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t('measurement.areaUnit')}
        <select
          aria-label={t('measurement.areaUnit')}
          className={control}
          value={rectilinear?.area[0]?.unit.trim().replace('²', '2') ?? ''}
          disabled={disabled || !rectilinear}
          onChange={(event) =>
            void run(() => measurement.setAreaUnit(target, event.target.value as AreaUnit, options))
          }
        >
          {!measurement
            .listAreaUnits()
            .includes(rectilinear?.area[0]?.unit.trim().replace('²', '2') as AreaUnit) && (
            <option value={rectilinear?.area[0]?.unit.trim().replace('²', '2') ?? ''}>
              {t('measurement.custom')}
            </option>
          )}
          {measurement.listAreaUnits().map((unit) => (
            <option key={unit} value={unit}>
              {unit.replace('2', '²')}
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
          onChange={(event) =>
            void run(() => measurement.setPrecision(target, Number(event.target.value), options))
          }
        >
          {![1, 10, 100, 1000, 10000].includes(precision) && (
            <option value={precision}>{t('measurement.custom')}</option>
          )}
          {[1, 10, 100, 1000, 10000].map((candidate) => (
            <option key={candidate} value={candidate}>
              {1 / candidate}
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
            readouts.map((readout, i) => (
              <div key={i} className="mb-2">
                <p>
                  {t(`measurement.${readout.kind}`)}: {readout.label}
                </p>
                {readout.perimeter && (
                  <p>
                    {t('measurement.perimeter')}: {readout.perimeter}
                  </p>
                )}
              </div>
            ))
          ) : (
            <p className="text-fg-muted">{t('measurement.unavailable')}</p>
          )}
          {resettable.length > 0 && (
            <button
              className={button}
              disabled={measurement.busy}
              onClick={() =>
                void run(async () => {
                  for (const annotation of resettable) {
                    const raw = annotation.raw;
                    if (raw && (raw.subtype === 'polygon' || raw.subtype === 'polyline')) {
                      await anno.updateRaw(annotation.ref, {
                        subtype: raw.subtype,
                        caption: { center: null },
                      });
                    }
                  }
                })
              }
            >
              {t('measurement.resetLabel')}
            </button>
          )}
        </section>
      )}
      {reports.length > 0 && (
        <p role="status">
          {t('measurement.report', {
            params: {
              updated: reports.reduce((total, report) => total + report.updated.length, 0),
              skipped: reports.reduce((total, report) => total + report.skipped.length, 0),
              failed: reports.reduce(
                (total, report) =>
                  total + report.failed.length + (report.scaleError || report.error ? 1 : 0),
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
  const canCalibrate = useSelector(MeasurementToken, (current) => current.canCalibrate());
  const request = useSelector(MeasurementToken, (measurement) =>
    measurement.getCalibrationRequest(),
  );
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
        {
          page: request.page,
          from: request.from,
          to: request.to,
          distance: { value: Number(value), unit },
        },
        { recalculate, applyTo: allPages ? 'all' : undefined },
      );
      measurement.dismissCalibration();
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  };
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !measurement.busy) measurement.dismissCalibration();
      }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="measurement-calibration-title"
        className="border-border bg-surface flex w-96 flex-col gap-4 rounded-lg border p-5 shadow-xl"
        onSubmit={(event) => {
          event.preventDefault();
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
            onChange={(event) => setValue(event.target.value)}
          />
        </label>
        <label>
          {t('measurement.unit')}
          <select
            className={control}
            aria-label={t('measurement.unit')}
            value={unit}
            onChange={(event) => setUnit(event.target.value as LengthUnit)}
          >
            {measurement.listUnits().map((lengthUnit) => (
              <option key={lengthUnit}>{lengthUnit}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={allPages}
            onChange={(event) => setAllPages(event.target.checked)}
          />
          {t('measurement.allPages')}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={recalculate}
            onChange={(event) => setRecalculate(event.target.checked)}
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
              !canCalibrate ||
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
