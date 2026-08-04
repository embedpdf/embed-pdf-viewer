import { h, Fragment } from 'preact';
import { useState, useEffect } from 'preact/hooks';

import {
  PdfMeasurementUnit,
  PdfMeasurementPrecision,
  PdfMeasurementScale,
  PdfMeasurementSecondaryUnit,
  formatNumber,
  unitLabel,
} from '@embedpdf/models';

import { PropertyConfig } from './property-schema';
import { Section, SectionLabel, Slider, ValueDisplay } from './ui';
import { ToggleButton } from '../ui/toggle-button';

export interface MeasurementSectionProps {
  config: PropertyConfig;
  value: any;
  onChange: (value: any) => void;
  translate: (key: string) => string;
}

const SELECT_CLASS =
  'border-border-default bg-bg-input text-fg-primary w-full rounded border px-2 py-1 text-sm';
const FRACTION_DENOMINATORS = [2, 4, 8, 16, 32];
const UNIT_VALUES = Object.values(PdfMeasurementUnit) as PdfMeasurementUnit[];

const unitOptionLabel = (translate: (k: string) => string, unit: PdfMeasurementUnit) => {
  const key = `measurement.units.${unit}`;
  const translated = translate(key);
  // Fall back to a generic label if the key is missing.
  return translated === key ? unitLabel(unit, false) : translated;
};

/* ─── Unit Select ───────────────────────────────────────────────────────── */

export function UnitSelectSection({ config, value, onChange, translate }: MeasurementSectionProps) {
  const [unit, setUnit] = useState<PdfMeasurementUnit>(value ?? PdfMeasurementUnit.PT);

  useEffect(() => setUnit(value ?? PdfMeasurementUnit.PT), [value]);

  const handleChange = (e: Event) => {
    const val = (e.target as HTMLSelectElement).value as PdfMeasurementUnit;
    setUnit(val);
    onChange(val);
  };

  return (
    <Section>
      <SectionLabel>{translate(config.labelKey)}</SectionLabel>
      <select class={SELECT_CLASS} value={unit} onChange={handleChange}>
        {UNIT_VALUES.map((u) => (
          <option key={u} value={u}>
            {unitOptionLabel(translate, u)}
          </option>
        ))}
      </select>
    </Section>
  );
}

/* ─── Precision Control ─────────────────────────────────────────────────── */

const DEFAULT_PRECISION: PdfMeasurementPrecision = { type: 'decimal', places: 2 };

export function PrecisionControlSection({
  config,
  value,
  onChange,
  translate,
}: MeasurementSectionProps) {
  const [precision, setPrecision] = useState<PdfMeasurementPrecision>(value ?? DEFAULT_PRECISION);

  useEffect(() => setPrecision(value ?? DEFAULT_PRECISION), [value]);

  const setDecimal = () => {
    if (precision.type === 'decimal') return;
    const next: PdfMeasurementPrecision = { type: 'decimal', places: 2 };
    setPrecision(next);
    onChange(next);
  };

  const setFraction = () => {
    if (precision.type === 'fraction') return;
    const next: PdfMeasurementPrecision = { type: 'fraction', denominator: 16 };
    setPrecision(next);
    onChange(next);
  };

  const setPlaces = (places: number) => {
    const next: PdfMeasurementPrecision = { type: 'decimal', places };
    setPrecision(next);
    onChange(next);
  };

  const setDenominator = (denominator: number) => {
    const next: PdfMeasurementPrecision = { type: 'fraction', denominator };
    setPrecision(next);
    onChange(next);
  };

  return (
    <Section>
      <SectionLabel>{translate(config.labelKey)}</SectionLabel>
      <div class="mb-3 flex gap-2">
        <ToggleButton
          active={precision.type === 'decimal'}
          onClick={setDecimal}
          className="!w-auto px-3"
          title={translate('annotation.precisionDecimal')}
        >
          {translate('annotation.precisionDecimal')}
        </ToggleButton>
        <ToggleButton
          active={precision.type === 'fraction'}
          onClick={setFraction}
          className="!w-auto px-3"
          title={translate('annotation.precisionFraction')}
        >
          {translate('annotation.precisionFraction')}
        </ToggleButton>
      </div>

      {precision.type === 'decimal' ? (
        <Fragment>
          <Slider value={precision.places} min={0} max={6} step={1} onChange={setPlaces} />
          <ValueDisplay>
            {translate('annotation.decimalPlaces')}: {precision.places}
          </ValueDisplay>
        </Fragment>
      ) : (
        <select
          class={SELECT_CLASS}
          value={precision.denominator}
          onChange={(e) => setDenominator(parseInt((e.target as HTMLSelectElement).value, 10))}
        >
          {FRACTION_DENOMINATORS.map((d) => (
            <option key={d} value={d}>
              1/{d}
            </option>
          ))}
        </select>
      )}
    </Section>
  );
}

/* ─── Secondary Unit ────────────────────────────────────────────────────── */

export function SecondaryUnitSection({
  config,
  value,
  onChange,
  translate,
}: MeasurementSectionProps) {
  const secondary = value as PdfMeasurementSecondaryUnit | undefined;
  const enabled = !!secondary;

  const toggle = () => {
    if (enabled) {
      onChange(undefined);
    } else {
      onChange({ unit: PdfMeasurementUnit.MM, precision: { type: 'decimal', places: 2 } });
    }
  };

  const setUnit = (e: Event) => {
    const unit = (e.target as HTMLSelectElement).value as PdfMeasurementUnit;
    onChange({ unit, precision: secondary?.precision ?? { type: 'decimal', places: 2 } });
  };

  return (
    <Section>
      <div class="flex items-center justify-between">
        <SectionLabel className="mb-0">{translate('annotation.showSecondary')}</SectionLabel>
        <ToggleButton active={enabled} onClick={toggle} title={translate('annotation.showSecondary')}>
          {enabled ? '✓' : ''}
        </ToggleButton>
      </div>
      {enabled && (
        <div class="mt-3">
          <SectionLabel>{translate(config.labelKey)}</SectionLabel>
          <select class={SELECT_CLASS} value={secondary?.unit} onChange={setUnit}>
            {UNIT_VALUES.map((u) => (
              <option key={u} value={u}>
                {unitOptionLabel(translate, u)}
              </option>
            ))}
          </select>
        </div>
      )}
    </Section>
  );
}

/* ─── Scale Display (read-only) ─────────────────────────────────────────── */

export function ScaleDisplaySection({ config, value, translate }: MeasurementSectionProps) {
  const scale = value as PdfMeasurementScale | undefined;
  if (!scale) return null;

  return (
    <Section>
      <SectionLabel>{translate(config.labelKey)}</SectionLabel>
      <div class="border-border-default bg-bg-input text-fg-primary rounded border px-2 py-1 text-sm">
        {scale.pagePoints} pt = {formatNumber(scale.value, { type: 'decimal', places: 2 })}{' '}
        {unitLabel(scale.unit, false)}
      </div>
      <ValueDisplay className="mt-1 block">{translate('annotation.calibrateAction')}</ValueDisplay>
    </Section>
  );
}
