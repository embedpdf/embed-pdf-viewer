import {
  PdfAnnotationSubtype,
  PdfWidgetAnnoObject,
  PDF_FORM_FIELD_TYPE,
  PDF_FORM_FIELD_FLAG,
  Rect,
  uuidV4,
} from '@embedpdf/models';
import {
  HandlerFactory,
  PreviewState,
  useState,
  useClickDetector,
} from '@embedpdf/plugin-annotation';
import { clamp } from '@embedpdf/core';

export const checkboxHandlerFactory: HandlerFactory<PdfWidgetAnnoObject> = {
  annotationType: PdfAnnotationSubtype.WIDGET,

  create(context) {
    const { pageIndex, onCommit, onPreview, getTool, pageSize } = context;
    const [getStart, setStart] = useState<{ x: number; y: number } | null>(null);

    const clampToPage = (pos: { x: number; y: number }) => ({
      x: clamp(pos.x, 0, pageSize.width),
      y: clamp(pos.y, 0, pageSize.height),
    });

    const getDefaults = () => {
      const tool = getTool();
      if (!tool) return null;
      return {
        ...tool.defaults,
        strokeColor: tool.defaults.strokeColor ?? '#000000',
        color: tool.defaults.color ?? '#FFFFFF',
        strokeWidth: tool.defaults.strokeWidth ?? 1,
        field: tool.defaults.field,
      };
    };

    const buildRect = (start: { x: number; y: number }, end: { x: number; y: number }): Rect => {
      const minX = Math.min(start.x, end.x);
      const minY = Math.min(start.y, end.y);
      const width = Math.abs(start.x - end.x);
      const height = Math.abs(start.y - end.y);
      return {
        origin: { x: minX, y: minY },
        size: { width, height },
      };
    };

    const buildAnnotation = (rect: Rect): PdfWidgetAnnoObject => {
      const defaults = getDefaults()!;
      const fieldName = `Checkbox_${uuidV4().slice(0, 8)}`;
      return {
        ...defaults,
        type: PdfAnnotationSubtype.WIDGET,
        id: uuidV4(),
        pageIndex,
        rect,
        created: new Date(),
        strokeColor: defaults.strokeColor,
        color: defaults.color,
        strokeWidth: defaults.strokeWidth,
        field: {
          type: PDF_FORM_FIELD_TYPE.CHECKBOX,
          flag: defaults.field?.flag ?? PDF_FORM_FIELD_FLAG.NONE,
          name: fieldName,
          alternateName: fieldName,
          value: '',
          isChecked: false,
        },
      } as PdfWidgetAnnoObject;
    };

    const clickDetector = useClickDetector<PdfWidgetAnnoObject>({
      getTool,
      onClickDetected: (pos) => {
        const defaults = getDefaults();
        if (!defaults) return;

        const tool = getTool();
        const clickConfig = tool?.clickBehavior;
        if (!clickConfig?.enabled) return;

        const { width, height } = clickConfig.defaultSize;
        const x = clamp(pos.x - width / 2, 0, pageSize.width - width);
        const y = clamp(pos.y - height / 2, 0, pageSize.height - height);
        const rect: Rect = {
          origin: { x, y },
          size: { width, height },
        };
        onCommit(buildAnnotation(rect));
      },
    });

    const getPreview = (current: {
      x: number;
      y: number;
    }): PreviewState<PdfAnnotationSubtype.WIDGET> | null => {
      const start = getStart();
      if (!start) return null;

      const defaults = getDefaults();
      if (!defaults) return null;

      const rect = buildRect(start, current);
      return {
        type: PdfAnnotationSubtype.WIDGET,
        bounds: rect,
        data: { rect, ...defaults },
      };
    };

    return {
      onPointerDown: (pos, evt) => {
        const clampedPos = clampToPage(pos);
        setStart(clampedPos);
        clickDetector.onStart(clampedPos);
        onPreview(getPreview(clampedPos));
        evt.setPointerCapture?.();
      },

      onPointerMove: (pos) => {
        const clampedPos = clampToPage(pos);
        clickDetector.onMove(clampedPos);

        if (getStart() && clickDetector.hasMoved()) {
          onPreview(getPreview(clampedPos));
        }
      },

      onPointerUp: (pos, evt) => {
        const start = getStart();
        if (!start) return;

        const clampedPos = clampToPage(pos);

        if (!clickDetector.hasMoved()) {
          clickDetector.onEnd(clampedPos);
        } else {
          const rect = buildRect(start, clampedPos);
          if (rect.size.width > 5 && rect.size.height > 5) {
            onCommit(buildAnnotation(rect));
          }
        }

        setStart(null);
        onPreview(null);
        clickDetector.reset();
        evt.releasePointerCapture?.();
      },

      onPointerLeave: (_, evt) => {
        setStart(null);
        onPreview(null);
        clickDetector.reset();
        evt.releasePointerCapture?.();
      },

      onPointerCancel: (_, evt) => {
        setStart(null);
        onPreview(null);
        clickDetector.reset();
        evt.releasePointerCapture?.();
      },
    };
  },
};
