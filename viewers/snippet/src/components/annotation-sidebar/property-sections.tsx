/** @jsxImportSource preact */
import { h, Fragment } from 'preact';
import { useState, useEffect } from 'preact/hooks';

import {
  PdfAnnotationBorderStyle,
  PdfAnnotationLineEnding,
  PdfBlendMode,
  PdfStandardFont,
  PdfStandardFontFamily,
  PdfTextAlignment,
  PdfVerticalAlignment,
  standardFontFamily,
  standardFontIsBold,
  standardFontIsItalic,
  makeStandardFont,
  LineEndings,
  blendModeValues,
} from '@embedpdf/models';

import { useDebounce } from '@/hooks/use-debounce';
import { PropertyConfig } from './property-schema';
import {
  ColorSwatch,
  Slider,
  StrokeStyleSelect,
  LineEndingSelect,
  FontFamilySelect,
  FontSizeInputSelect,
  RotationInput,
  Section,
  SectionLabel,
  ValueDisplay,
} from './ui';
import { Icon } from '../ui/icon';
import { ToggleButton } from '../ui/toggle-button';

/* ═══════════════════════════════════════════════════════════════════════════
 * Types
 * ═══════════════════════════════════════════════════════════════════════════ */

export interface PropertySectionProps {
  config: PropertyConfig;
  value: any;
  onChange: (value: any) => void;
  colorPresets: string[];
  translate: (key: string) => string;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Main PropertySection Component
 * Renders the appropriate control based on config.type
 * ═══════════════════════════════════════════════════════════════════════════ */

export function PropertySection(props: PropertySectionProps) {
  const { config } = props;

  switch (config.type) {
    case 'color':
      return <ColorSection {...props} allowTransparent={false} />;
    case 'colorWithTransparent':
      return <ColorSection {...props} allowTransparent={true} />;
    case 'opacity':
      return <OpacitySection {...props} />;
    case 'slider':
      return <SliderSection {...props} />;
    case 'strokeStyle':
      return <StrokeStyleSection {...props} />;
    case 'lineEndings':
      return <LineEndingsSection {...props} />;
    case 'fontFamily':
      return <FontFamilySection {...props} />;
    case 'fontSize':
      return <FontSizeSection {...props} />;
    case 'fontColor':
      return <FontColorSection {...props} />;
    case 'textAlign':
      return <TextAlignSection {...props} />;
    case 'verticalAlign':
      return <VerticalAlignSection {...props} />;
    case 'blendMode':
      return <BlendModeSection {...props} />;
    case 'text':
      return <TextSection {...props} />;
    case 'rotation':
      return <RotationSection {...props} />;
    default:
      return null;
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Individual Section Components
 * ═══════════════════════════════════════════════════════════════════════════ */

/* ─── Color Section ─────────────────────────────────────────────────────── */

function ColorSection({
  config,
  value,
  onChange,
  colorPresets,
  translate,
  allowTransparent,
}: PropertySectionProps & { allowTransparent: boolean }) {
  const [color, setColor] = useState(value ?? '#000000');

  useEffect(() => setColor(value ?? '#000000'), [value]);

  const handleChange = (c: string) => {
    setColor(c);
    onChange(c);
  };

  return (
    <Section>
      <SectionLabel className="mb-3">{translate(config.labelKey)}</SectionLabel>
      <div class="grid grid-cols-6 gap-x-1 gap-y-4">
        {colorPresets.map((c) => (
          <ColorSwatch key={c} color={c} active={c === color} onSelect={handleChange} />
        ))}
        {allowTransparent && (
          <ColorSwatch
            color="transparent"
            active={color === 'transparent'}
            onSelect={handleChange}
          />
        )}
      </div>
    </Section>
  );
}

/* ─── Opacity Section ───────────────────────────────────────────────────── */

function OpacitySection({ config, value, onChange, translate }: PropertySectionProps) {
  const [opacity, setOpacity] = useState(value ?? 1);

  useEffect(() => setOpacity(value ?? 1), [value]);

  const debOpacity = useDebounce(opacity, 300);
  useEffect(() => {
    if (debOpacity !== value) {
      onChange(debOpacity);
    }
  }, [debOpacity]);

  return (
    <Section>
      <SectionLabel>{translate(config.labelKey)}</SectionLabel>
      <Slider
        value={opacity}
        min={config.min ?? 0.1}
        max={config.max ?? 1}
        step={config.step ?? 0.05}
        onChange={setOpacity}
      />
      <ValueDisplay>{Math.round(opacity * 100)}%</ValueDisplay>
    </Section>
  );
}

/* ─── Generic Slider Section ────────────────────────────────────────────── */

function SliderSection({ config, value, onChange, translate }: PropertySectionProps) {
  const [val, setVal] = useState(value ?? config.min ?? 1);

  useEffect(() => setVal(value ?? config.min ?? 1), [value]);

  const debVal = useDebounce(val, 300);
  useEffect(() => {
    if (debVal !== value) {
      onChange(debVal);
    }
  }, [debVal]);

  return (
    <Section>
      <SectionLabel>{translate(config.labelKey)}</SectionLabel>
      <Slider
        value={val}
        min={config.min ?? 1}
        max={config.max ?? 30}
        step={config.step ?? 1}
        onChange={setVal}
      />
      <ValueDisplay>
        {val}
        {config.unit ?? ''}
      </ValueDisplay>
    </Section>
  );
}

/* ─── Stroke Style Section ──────────────────────────────────────────────── */

type StrokeItem = { id: PdfAnnotationBorderStyle; dash?: number[] };

function StrokeStyleSection({ config, value, onChange, translate }: PropertySectionProps) {
  // Value could be just the style ID or the full object with dash array
  const currentStyle: StrokeItem =
    typeof value === 'object' && value !== null
      ? value
      : { id: value ?? PdfAnnotationBorderStyle.SOLID };

  const [style, setStyle] = useState<StrokeItem>(currentStyle);

  useEffect(() => {
    const newStyle =
      typeof value === 'object' && value !== null
        ? value
        : { id: value ?? PdfAnnotationBorderStyle.SOLID };
    setStyle(newStyle);
  }, [value]);

  const handleChange = (s: StrokeItem) => {
    setStyle(s);
    // Pass both style and dash array
    onChange({ strokeStyle: s.id, strokeDashArray: s.dash });
  };

  return (
    <Section>
      <SectionLabel className="mb-3">{translate(config.labelKey)}</SectionLabel>
      <StrokeStyleSelect value={style} onChange={handleChange} />
    </Section>
  );
}

/* ─── Line Endings Section ──────────────────────────────────────────────── */

function LineEndingsSection({ config, value, onChange, translate }: PropertySectionProps) {
  const lineEndings: LineEndings = value ?? {
    start: PdfAnnotationLineEnding.None,
    end: PdfAnnotationLineEnding.None,
  };

  const [startEnding, setStartEnding] = useState(lineEndings.start);
  const [endEnding, setEndEnding] = useState(lineEndings.end);

  useEffect(() => {
    setStartEnding(lineEndings.start);
    setEndEnding(lineEndings.end);
  }, [value]);

  const changeStartEnding = (e: PdfAnnotationLineEnding) => {
    setStartEnding(e);
    onChange({ start: e, end: endEnding });
  };

  const changeEndEnding = (e: PdfAnnotationLineEnding) => {
    setEndEnding(e);
    onChange({ start: startEnding, end: e });
  };

  return (
    <Section>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <SectionLabel className="mb-3">{translate('annotation.lineStart')}</SectionLabel>
          <LineEndingSelect value={startEnding} onChange={changeStartEnding} position="start" />
        </div>
        <div>
          <SectionLabel className="mb-3">{translate('annotation.lineEnd')}</SectionLabel>
          <LineEndingSelect value={endEnding} onChange={changeEndEnding} position="end" />
        </div>
      </div>
    </Section>
  );
}

/* ─── Font Family Section ───────────────────────────────────────────────── */

function FontFamilySection({ config, value, onChange, translate }: PropertySectionProps) {
  const baseFont: PdfStandardFont = value ?? PdfStandardFont.Helvetica;
  const baseFamily = standardFontFamily(baseFont);
  const baseBold = standardFontIsBold(baseFont);
  const baseItalic = standardFontIsItalic(baseFont);

  const [fontFamily, setFontFamily] = useState(baseFamily);
  const [bold, setBold] = useState(baseBold);
  const [italic, setItalic] = useState(baseItalic);

  useEffect(() => {
    const font: PdfStandardFont = value ?? PdfStandardFont.Helvetica;
    setFontFamily(standardFontFamily(font));
    setBold(standardFontIsBold(font));
    setItalic(standardFontIsItalic(font));
  }, [value]);

  const updateFontEnum = (fam: PdfStandardFontFamily, b: boolean, i: boolean) => {
    const id = makeStandardFont(fam, { bold: b, italic: i });
    onChange(id);
  };

  const onFamilyChange = (fam: PdfStandardFontFamily) => {
    const supportsBold = standardFontIsBold(makeStandardFont(fam, { bold: true, italic: false }));
    const supportsItalic = standardFontIsItalic(
      makeStandardFont(fam, { bold: false, italic: true }),
    );
    const newBold = supportsBold ? bold : false;
    const newItalic = supportsItalic ? italic : false;

    setFontFamily(fam);
    setBold(newBold);
    setItalic(newItalic);
    updateFontEnum(fam, newBold, newItalic);
  };

  const toggleBold = () => {
    const supports = standardFontIsBold(
      makeStandardFont(fontFamily, { bold: true, italic: false }),
    );
    if (!supports) return;
    const newBold = !bold;
    setBold(newBold);
    updateFontEnum(fontFamily, newBold, italic);
  };

  const toggleItalic = () => {
    const supports = standardFontIsItalic(
      makeStandardFont(fontFamily, { bold: false, italic: true }),
    );
    if (!supports) return;
    const newItalic = !italic;
    setItalic(newItalic);
    updateFontEnum(fontFamily, bold, newItalic);
  };

  return (
    <Section>
      <SectionLabel>{translate(config.labelKey)}</SectionLabel>
      <div class="mb-3">
        <FontFamilySelect value={fontFamily} onChange={onFamilyChange} />
      </div>
      <div class="flex gap-2">
        <ToggleButton
          title="Bold"
          active={bold}
          disabled={
            !standardFontIsBold(makeStandardFont(fontFamily, { bold: true, italic: false }))
          }
          onClick={toggleBold}
          className="font-bold"
        >
          <Icon icon="bold" size={18} />
        </ToggleButton>
        <ToggleButton
          title="Italic"
          active={italic}
          disabled={
            !standardFontIsItalic(makeStandardFont(fontFamily, { bold: false, italic: true }))
          }
          onClick={toggleItalic}
          className="italic"
        >
          <Icon icon="italic" size={18} />
        </ToggleButton>
      </div>
    </Section>
  );
}

/* ─── Font Size Section ─────────────────────────────────────────────────── */

function FontSizeSection({ config, value, onChange, translate }: PropertySectionProps) {
  const [fontSize, setFontSize] = useState(value ?? 12);

  useEffect(() => setFontSize(value ?? 12), [value]);

  const handleChange = (size: number) => {
    if (!Number.isFinite(size) || size <= 0) return;
    setFontSize(size);
    onChange(size);
  };

  return (
    <Section>
      <SectionLabel>{translate(config.labelKey)}</SectionLabel>
      <FontSizeInputSelect value={fontSize} onChange={handleChange} />
    </Section>
  );
}

/* ─── Font Color Section ────────────────────────────────────────────────── */

function FontColorSection({
  config,
  value,
  onChange,
  colorPresets,
  translate,
}: PropertySectionProps) {
  const [fontColor, setFontColor] = useState(value ?? '#000000');

  useEffect(() => setFontColor(value ?? '#000000'), [value]);

  const handleChange = (c: string) => {
    setFontColor(c);
    onChange(c);
  };

  return (
    <Section>
      <SectionLabel className="mb-3">{translate(config.labelKey)}</SectionLabel>
      <div class="grid grid-cols-6 gap-x-1 gap-y-4">
        {colorPresets.map((c) => (
          <ColorSwatch key={c} color={c} active={c === fontColor} onSelect={handleChange} />
        ))}
      </div>
    </Section>
  );
}

/* ─── Text Align Section ────────────────────────────────────────────────── */

function TextAlignSection({ config, value, onChange, translate }: PropertySectionProps) {
  const [textAlign, setTextAlign] = useState<PdfTextAlignment>(value ?? PdfTextAlignment.Left);

  useEffect(() => setTextAlign(value ?? PdfTextAlignment.Left), [value]);

  const handleChange = (align: PdfTextAlignment) => {
    setTextAlign(align);
    onChange(align);
  };

  return (
    <Section>
      <SectionLabel>{translate(config.labelKey)}</SectionLabel>
      <div class="flex gap-2">
        <ToggleButton
          title="Align left"
          active={textAlign === PdfTextAlignment.Left}
          onClick={() => handleChange(PdfTextAlignment.Left)}
        >
          <Icon icon="alignLeft" size={18} />
        </ToggleButton>
        <ToggleButton
          title="Align center"
          active={textAlign === PdfTextAlignment.Center}
          onClick={() => handleChange(PdfTextAlignment.Center)}
        >
          <Icon icon="alignCenter" size={18} />
        </ToggleButton>
        <ToggleButton
          title="Align right"
          active={textAlign === PdfTextAlignment.Right}
          onClick={() => handleChange(PdfTextAlignment.Right)}
        >
          <Icon icon="alignRight" size={18} />
        </ToggleButton>
      </div>
    </Section>
  );
}

/* ─── Vertical Align Section ────────────────────────────────────────────── */

function VerticalAlignSection({ config, value, onChange, translate }: PropertySectionProps) {
  const [verticalAlign, setVerticalAlign] = useState<PdfVerticalAlignment>(
    value ?? PdfVerticalAlignment.Top,
  );

  useEffect(() => setVerticalAlign(value ?? PdfVerticalAlignment.Top), [value]);

  const handleChange = (align: PdfVerticalAlignment) => {
    setVerticalAlign(align);
    onChange(align);
  };

  return (
    <Section>
      <SectionLabel>{translate(config.labelKey)}</SectionLabel>
      <div class="flex gap-2">
        <ToggleButton
          title="Align top"
          active={verticalAlign === PdfVerticalAlignment.Top}
          onClick={() => handleChange(PdfVerticalAlignment.Top)}
        >
          <Icon icon="alignTop" size={18} />
        </ToggleButton>
        <ToggleButton
          title="Align middle"
          active={verticalAlign === PdfVerticalAlignment.Middle}
          onClick={() => handleChange(PdfVerticalAlignment.Middle)}
        >
          <Icon icon="alignMiddle" size={18} />
        </ToggleButton>
        <ToggleButton
          title="Align bottom"
          active={verticalAlign === PdfVerticalAlignment.Bottom}
          onClick={() => handleChange(PdfVerticalAlignment.Bottom)}
        >
          <Icon icon="alignBottom" size={18} />
        </ToggleButton>
      </div>
    </Section>
  );
}

/* ─── Blend Mode Section ─────────────────────────────────────────────────── */

/** Map blend mode enum to translation key */
const BLEND_MODE_KEYS: Record<PdfBlendMode, string> = {
  [PdfBlendMode.Normal]: 'blendMode.normal',
  [PdfBlendMode.Multiply]: 'blendMode.multiply',
  [PdfBlendMode.Screen]: 'blendMode.screen',
  [PdfBlendMode.Overlay]: 'blendMode.overlay',
  [PdfBlendMode.Darken]: 'blendMode.darken',
  [PdfBlendMode.Lighten]: 'blendMode.lighten',
  [PdfBlendMode.ColorDodge]: 'blendMode.colorDodge',
  [PdfBlendMode.ColorBurn]: 'blendMode.colorBurn',
  [PdfBlendMode.HardLight]: 'blendMode.hardLight',
  [PdfBlendMode.SoftLight]: 'blendMode.softLight',
  [PdfBlendMode.Difference]: 'blendMode.difference',
  [PdfBlendMode.Exclusion]: 'blendMode.exclusion',
  [PdfBlendMode.Hue]: 'blendMode.hue',
  [PdfBlendMode.Saturation]: 'blendMode.saturation',
  [PdfBlendMode.Color]: 'blendMode.color',
  [PdfBlendMode.Luminosity]: 'blendMode.luminosity',
};

function BlendModeSection({ config, value, onChange, translate }: PropertySectionProps) {
  const [blendMode, setBlendMode] = useState<PdfBlendMode>(value ?? PdfBlendMode.Normal);

  useEffect(() => setBlendMode(value ?? PdfBlendMode.Normal), [value]);

  const handleChange = (e: Event) => {
    const val = parseInt((e.target as HTMLSelectElement).value, 10) as PdfBlendMode;
    setBlendMode(val);
    onChange(val);
  };

  return (
    <Section>
      <SectionLabel>{translate(config.labelKey)}</SectionLabel>
      <select
        class="border-border-default bg-bg-input text-fg-primary w-full rounded border px-2 py-1 text-sm"
        value={blendMode}
        onChange={handleChange}
      >
        {blendModeValues.map((mode) => (
          <option key={mode} value={mode}>
            {translate(BLEND_MODE_KEYS[mode])}
          </option>
        ))}
      </select>
    </Section>
  );
}

/* ─── Text Section ───────────────────────────────────────────────────────── */

function TextSection({ config, value, onChange, translate }: PropertySectionProps) {
  const [text, setText] = useState(value ?? '');

  useEffect(() => setText(value ?? ''), [value]);

  // Debounce the text value before triggering onChange
  const debouncedText = useDebounce(text, 300);
  useEffect(() => {
    if (debouncedText !== value) {
      onChange(debouncedText);
    }
  }, [debouncedText]);

  const handleChange = (e: Event) => {
    const val = (e.target as HTMLInputElement).value;
    setText(val);
  };

  return (
    <Section>
      <SectionLabel>{translate(config.labelKey)}</SectionLabel>
      <input
        type="text"
        class="border-border-default bg-bg-input text-fg-primary w-full rounded border px-2 py-1 text-sm"
        value={text}
        onInput={handleChange}
        placeholder={config.placeholderKey ? translate(config.placeholderKey) : undefined}
      />
    </Section>
  );
}

/* ─── Rotation Section ───────────────────────────────────────────────────── */

function RotationSection({ config, value, onChange, translate }: PropertySectionProps) {
  const [rotation, setRotation] = useState(value ?? 0);

  useEffect(() => setRotation(value ?? 0), [value]);

  const debRotation = useDebounce(rotation, 300);
  useEffect(() => {
    if (debRotation !== value) {
      onChange(debRotation);
    }
  }, [debRotation]);

  return (
    <Section>
      <SectionLabel>{translate(config.labelKey)}</SectionLabel>
      <RotationInput value={rotation} onChange={setRotation} />
    </Section>
  );
}
