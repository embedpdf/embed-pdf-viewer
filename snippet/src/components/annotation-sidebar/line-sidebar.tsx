import { Fragment, h } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { useAnnotationCapability } from '@embedpdf/plugin-annotation/preact';
import {
  PdfAnnotationBorderStyle,
  PdfAnnotationLineEnding,
  PdfLineAnnoObject,
  PdfPolylineAnnoObject,
} from '@embedpdf/models';

import { useDebounce } from '@/hooks/use-debounce';
import { SidebarPropsBase } from './common';
import { ColorSwatch, LineEndingSelect, Slider, StrokeStyleSelect } from './ui';

export const LineSidebar = ({
  selected,
  activeTool,
  colorPresets,
}: SidebarPropsBase<PdfLineAnnoObject | PdfPolylineAnnoObject>) => {
  const { provides: annotation } = useAnnotationCapability();
  if (!annotation) return null;

  const anno = selected?.object;
  const defaults = activeTool?.defaults;
  const editing = !!anno;

  const baseFill = editing ? anno.color : (defaults?.color ?? '#000000');
  const baseStroke = editing ? anno.strokeColor : (defaults?.strokeColor ?? '#000000');
  const baseOpac = editing ? anno.opacity : (defaults?.opacity ?? 1);
  const baseWidth = editing ? anno.strokeWidth : (defaults?.strokeWidth ?? 2);
  const baseLineEndings = editing
    ? (anno.lineEndings ?? {
        start: PdfAnnotationLineEnding.None,
        end: PdfAnnotationLineEnding.None,
      })
    : (defaults?.lineEndings ?? {
        start: PdfAnnotationLineEnding.None,
        end: PdfAnnotationLineEnding.None,
      });
  const baseStyle = editing
    ? { id: anno.strokeStyle, dash: anno.strokeDashArray }
    : {
        id: defaults?.strokeStyle ?? PdfAnnotationBorderStyle.SOLID,
        dash: defaults?.strokeDashArray,
      };

  const [fill, setFill] = useState(baseFill);
  const [stroke, setStroke] = useState(baseStroke);
  const [opacity, setOpac] = useState(baseOpac);
  const [strokeW, setWidth] = useState(baseWidth);
  const [style, setStyle] = useState<{ id: PdfAnnotationBorderStyle; dash?: number[] }>(baseStyle);
  const [startEnding, setStartEnding] = useState(baseLineEndings.start);
  const [endEnding, setEndEnding] = useState(baseLineEndings.end);

  useEffect(() => setFill(baseFill), [baseFill]);
  useEffect(() => setStroke(baseStroke), [baseStroke]);
  useEffect(() => setOpac(baseOpac), [baseOpac]);
  useEffect(() => setWidth(baseWidth), [baseWidth]);
  useEffect(() => setStyle(baseStyle), [baseStyle]);
  useEffect(() => setStartEnding(baseLineEndings.start), [baseLineEndings.start]);
  useEffect(() => setEndEnding(baseLineEndings.end), [baseLineEndings.end]);

  const debOpacity = useDebounce(opacity, 300);
  const debWidth = useDebounce(strokeW, 300);
  useEffect(() => applyPatch({ opacity: debOpacity }), [debOpacity]);
  useEffect(() => applyPatch({ strokeWidth: debWidth }), [debWidth]);

  const changeFill = (c: string) => {
    setFill(c);
    applyPatch({ color: c });
  };

  const changeStroke = (c: string) => {
    setStroke(c);
    applyPatch({ strokeColor: c });
  };

  const changeStyle = (s: { id: PdfAnnotationBorderStyle; dash?: number[] }) => {
    setStyle(s);
    applyPatch({ strokeStyle: s.id, strokeDashArray: s.dash });
  };

  const changeStartEnding = (e: PdfAnnotationLineEnding) => {
    setStartEnding(e);
    applyPatch({ lineEndings: { start: e, end: endEnding } });
  };
  const changeEndEnding = (e: PdfAnnotationLineEnding) => {
    setEndEnding(e);
    applyPatch({ lineEndings: { start: startEnding, end: e } });
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
      {/* stroke color */}
      <section class="mb-6">
        <label class="mb-3 block text-sm font-medium text-gray-900">Stroke color</label>
        <div class="grid grid-cols-6 gap-x-1 gap-y-4">
          {colorPresets.map((c) => (
            <ColorSwatch key={c} color={c} active={c === stroke} onSelect={changeStroke} />
          ))}
          <ColorSwatch
            color="transparent"
            active={stroke === 'transparent'}
            onSelect={changeStroke}
          />
        </div>
      </section>

      {/* opacity */}
      <section class="mb-6">
        <label class="mb-1 block text-sm font-medium text-gray-900">Opacity</label>
        <Slider value={opacity} min={0.1} max={1} step={0.05} onChange={setOpac} />
        <span class="text-xs text-gray-500">{Math.round(opacity * 100)}%</span>
      </section>

      {/* stroke style */}
      <section class="mb-6">
        <label class="mb-3 block text-sm font-medium text-gray-900">Stroke style</label>
        <StrokeStyleSelect value={style} onChange={changeStyle} />
      </section>

      {/* stroke width */}
      <section class="mb-6">
        <label class="mb-1 block text-sm font-medium text-gray-900">Stroke width</label>
        <Slider value={strokeW} min={1} max={10} step={1} onChange={setWidth} />
        <span class="text-xs text-gray-500">{strokeW}</span>
      </section>

      {/* line endings in a grid */}
      <section class="mb-6">
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="mb-3 block text-sm font-medium text-gray-900 dark:text-gray-200">
              Line start
            </label>
            <LineEndingSelect value={startEnding} onChange={changeStartEnding} position="start" />
          </div>
          <div>
            <label class="mb-3 block text-sm font-medium text-gray-900 dark:text-gray-200">
              Line end
            </label>
            <LineEndingSelect value={endEnding} onChange={changeEndEnding} position="end" />
          </div>
        </div>
      </section>

      {/* fill color */}
      <section class="mb-6">
        <label class="mb-3 block text-sm font-medium text-gray-900">Fill color</label>
        <div class="grid grid-cols-6 gap-x-1 gap-y-4">
          {colorPresets.map((c) => (
            <ColorSwatch key={c} color={c} active={c === fill} onSelect={changeFill} />
          ))}
          <ColorSwatch color="transparent" active={fill === 'transparent'} onSelect={changeFill} />
        </div>
      </section>
    </Fragment>
  );
};
