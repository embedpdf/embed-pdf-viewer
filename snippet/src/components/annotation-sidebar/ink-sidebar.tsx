import { Fragment, h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { useAnnotationCapability } from '@embedpdf/plugin-annotation/preact';
import { PdfInkAnnoObject } from '@embedpdf/models';
import { SidebarPropsBase } from './common';
import { Slider, ColorSwatch } from './ui';
import { useDebounce } from '../../hooks/use-debounce';

export const InkSidebar = ({
  selected,
  activeTool,
  colorPresets,
}: SidebarPropsBase<PdfInkAnnoObject>) => {
  const { provides: annotation } = useAnnotationCapability();
  if (!annotation) return null;

  const anno = selected?.object;
  const defaults = activeTool?.defaults;

  /* base values from the selected annotation or the tool's current defaults */
  const baseColor = anno?.color ?? defaults?.color ?? '#000000';
  const baseOpacity = anno?.opacity ?? defaults?.opacity ?? 1;
  const baseStroke = anno?.strokeWidth ?? defaults?.strokeWidth ?? 2;

  const [color, setColor] = useState(baseColor);
  const [opacity, setOpacity] = useState(baseOpacity);
  const [stroke, setStroke] = useState(baseStroke);

  useEffect(() => setColor(baseColor), [baseColor]);
  useEffect(() => setOpacity(baseOpacity), [baseOpacity]);
  useEffect(() => setStroke(baseStroke), [baseStroke]);

  const debOpacity = useDebounce(opacity, 300);
  const debStroke = useDebounce(stroke, 300);
  useEffect(() => applyPatch({ opacity: debOpacity }), [debOpacity]);
  useEffect(() => applyPatch({ strokeWidth: debStroke }), [debStroke]);

  const changeColor = (c: string) => {
    setColor(c);
    applyPatch({ color: c });
  };

  function applyPatch(patch: Partial<PdfInkAnnoObject>) {
    if (!annotation) return;
    if (anno) {
      // If editing a selected annotation, update it
      annotation.updateAnnotation(anno.pageIndex, anno.id, patch);
    } else if (activeTool) {
      // If editing tool defaults, update the tool by its ID
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

      {/* stroke-width */}
      <section class="mb-6">
        <label class="mb-1 block text-sm font-medium text-gray-900">Stroke width</label>
        <Slider value={stroke} min={1} max={30} step={1} onChange={setStroke} />
        <span class="text-xs text-gray-500">{stroke}px</span>
      </section>
    </Fragment>
  );
};
