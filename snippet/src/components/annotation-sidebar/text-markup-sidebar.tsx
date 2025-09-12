import { Fragment, h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { useAnnotationCapability } from '@embedpdf/plugin-annotation/preact';
import {
  PdfBlendMode,
  PdfHighlightAnnoObject,
  PdfSquigglyAnnoObject,
  PdfStrikeOutAnnoObject,
  PdfUnderlineAnnoObject,
  blendModeSelectOptions,
} from '@embedpdf/models';
import { SidebarPropsBase } from './common';
import { Slider, ColorSwatch } from './ui';
import { useDebounce } from '../../hooks/use-debounce';

export const TextMarkupSidebar = ({
  selected,
  activeTool,
  colorPresets,
}: SidebarPropsBase<
  PdfHighlightAnnoObject | PdfUnderlineAnnoObject | PdfStrikeOutAnnoObject | PdfSquigglyAnnoObject
>) => {
  const { provides: annotation } = useAnnotationCapability();
  if (!annotation) return null;

  const anno = selected?.object;
  const defaults = activeTool?.defaults;
  const editing = !!anno;

  const baseColor = editing ? anno.color : (defaults?.color ?? '#FFFF00');
  const baseOpacity = editing ? anno.opacity : (defaults?.opacity ?? 1);
  const baseBlend = editing
    ? (anno.blendMode ?? PdfBlendMode.Normal)
    : (defaults?.blendMode ?? PdfBlendMode.Normal);

  const [color, setColor] = useState(baseColor);
  const [opacity, setOpacity] = useState(baseOpacity);
  const [blend, setBlend] = useState(baseBlend);

  useEffect(() => setColor(baseColor), [baseColor]);
  useEffect(() => setOpacity(baseOpacity), [baseOpacity]);
  useEffect(() => setBlend(baseBlend), [baseBlend]);

  const debOpacity = useDebounce(opacity, 300);
  useEffect(() => applyPatch({ opacity: debOpacity }), [debOpacity]);

  const changeColor = (c: string) => {
    setColor(c);
    applyPatch({ color: c });
  };

  const changeBlend = (val: number) => {
    const bm = val as PdfBlendMode;
    setBlend(bm);
    applyPatch({ blendMode: bm });
  };

  function applyPatch(patch: Partial<any>) {
    if (!annotation) return;
    if (editing) {
      annotation.updateAnnotation(anno.pageIndex, anno.id, patch);
    } else if (activeTool) {
      annotation.setToolDefaults(activeTool.id, patch);
    }
  }

  return (
    <Fragment>
      {/* color */}
      <section class="mb-6">
        <label class="mb-3 block text-sm font-medium text-gray-900">Color</label>
        <div class="grid grid-cols-6 gap-x-1 gap-y-4">
          {colorPresets.map((c) => (
            <ColorSwatch key={c} color={c} active={c === color} onSelect={changeColor} />
          ))}
        </div>
      </section>

      {/* opacity */}
      <section class="mb-6">
        <label class="mb-1 block text-sm font-medium text-gray-900">Opacity</label>
        <Slider value={opacity} min={0.1} max={1} step={0.05} onChange={setOpacity} />
        <span class="text-xs text-gray-500">{Math.round(opacity * 100)}%</span>
      </section>

      {/* blend mode */}
      <section class="mb-6">
        <label class="mb-1 block text-sm font-medium text-gray-900">Blend mode</label>
        <select
          class="w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm"
          value={blend}
          onChange={(e) => changeBlend(parseInt((e.target as HTMLSelectElement).value, 10))}
        >
          {blendModeSelectOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </section>
    </Fragment>
  );
};
