import {
  PdfAnnotationLineEnding,
  PdfAnnotationSubtype,
  PdfFreeTextAnnoObject,
  PdfStandardFont,
  PdfTextAlignment,
  PdfVerticalAlignment,
  Rect,
  uuidV4,
} from '@embedpdf/models';
import { clamp } from '@embedpdf/core';
import { HandlerFactory, PreviewState } from './types';
import { useState } from '../utils/use-state';
import {
  computeCalloutConnectionPoint,
  computeCalloutOverallRect,
  computeRDFromTextBox,
} from '../patching';

const CLICK_THRESHOLD = 5;
const DEFAULT_TB_WIDTH = 150;
const DEFAULT_TB_HEIGHT = 40;

type Phase = 'arrow' | 'knee' | 'textbox' | 'idle';

export const calloutFreeTextHandlerFactory: HandlerFactory<PdfFreeTextAnnoObject> = {
  annotationType: PdfAnnotationSubtype.FREETEXT,
  create(context) {
    const { onCommit, onPreview, getTool, pageSize, pageIndex } = context;

    const [getPhase, setPhase] = useState<Phase>('arrow');
    const [getArrowTip, setArrowTip] = useState<{ x: number; y: number } | null>(null);
    const [getKnee, setKnee] = useState<{ x: number; y: number } | null>(null);
    const [getDownPos, setDownPos] = useState<{ x: number; y: number } | null>(null);
    const [getTextBoxStart, setTextBoxStart] = useState<{ x: number; y: number } | null>(null);
    const [getDragging, setDragging] = useState(false);

    const clampToPage = (pos: { x: number; y: number }) => ({
      x: clamp(pos.x, 0, pageSize.width),
      y: clamp(pos.y, 0, pageSize.height),
    });

    const clampTextBox = (tb: Rect): Rect => ({
      origin: {
        x: clamp(tb.origin.x, 0, pageSize.width - tb.size.width),
        y: clamp(tb.origin.y, 0, pageSize.height - tb.size.height),
      },
      size: tb.size,
    });

    const getDefaults = () => {
      const tool = getTool();
      if (!tool) return null;
      return {
        ...tool.defaults,
        fontColor: tool.defaults.fontColor ?? '#000000',
        opacity: tool.defaults.opacity ?? 1,
        fontSize: tool.defaults.fontSize ?? 12,
        fontFamily: tool.defaults.fontFamily ?? PdfStandardFont.Helvetica,
        color: tool.defaults.color ?? tool.defaults.backgroundColor ?? 'transparent',
        textAlign: tool.defaults.textAlign ?? PdfTextAlignment.Left,
        verticalAlign: tool.defaults.verticalAlign ?? PdfVerticalAlignment.Top,
        contents: tool.defaults.contents ?? 'Insert text',
        flags: tool.defaults.flags ?? ['print'],
        lineEnding: tool.defaults.lineEnding ?? PdfAnnotationLineEnding.OpenArrow,
        strokeColor: tool.defaults.strokeColor ?? '#000000',
        strokeWidth: tool.defaults.strokeWidth ?? 1,
      };
    };

    const isClick = (a: { x: number; y: number }, b: { x: number; y: number }) =>
      Math.abs(a.x - b.x) < CLICK_THRESHOLD && Math.abs(a.y - b.y) < CLICK_THRESHOLD;

    const buildPreview = (cursor: {
      x: number;
      y: number;
    }): PreviewState<PdfAnnotationSubtype.FREETEXT> | null => {
      const defaults = getDefaults();
      if (!defaults) return null;
      const arrowTip = getArrowTip();
      const knee = getKnee();
      const phase = getPhase();

      if (phase === 'knee' && arrowTip) {
        const calloutLine = [arrowTip, cursor];
        const minX = Math.min(arrowTip.x, cursor.x);
        const minY = Math.min(arrowTip.y, cursor.y);
        const w = Math.abs(arrowTip.x - cursor.x);
        const h = Math.abs(arrowTip.y - cursor.y);
        const bounds: Rect = {
          origin: { x: minX, y: minY },
          size: { width: Math.max(w, 1), height: Math.max(h, 1) },
        };
        return {
          type: PdfAnnotationSubtype.FREETEXT,
          bounds,
          data: {
            ...defaults,
            rect: bounds,
            calloutLine,
          },
        };
      }

      if (phase === 'textbox' && arrowTip && knee) {
        const tbStart = getTextBoxStart();
        let textBox: Rect;
        if (getDragging() && tbStart) {
          textBox = {
            origin: { x: Math.min(tbStart.x, cursor.x), y: Math.min(tbStart.y, cursor.y) },
            size: {
              width: Math.max(Math.abs(cursor.x - tbStart.x), 20),
              height: Math.max(Math.abs(cursor.y - tbStart.y), 14),
            },
          };
        } else {
          textBox = {
            origin: { x: cursor.x - DEFAULT_TB_WIDTH / 2, y: cursor.y - DEFAULT_TB_HEIGHT / 2 },
            size: { width: DEFAULT_TB_WIDTH, height: DEFAULT_TB_HEIGHT },
          };
        }
        textBox = clampTextBox(textBox);
        const connectionPoint = computeCalloutConnectionPoint(knee, textBox);
        const calloutLine = [arrowTip, knee, connectionPoint];
        const overallRect = computeCalloutOverallRect(
          textBox,
          calloutLine,
          defaults.lineEnding,
          defaults.strokeWidth,
        );
        return {
          type: PdfAnnotationSubtype.FREETEXT,
          bounds: overallRect,
          data: {
            ...defaults,
            rect: overallRect,
            calloutLine,
            textBox,
          },
        };
      }

      return null;
    };

    const commitCallout = (tb: Rect) => {
      const defaults = getDefaults();
      const arrowTip = getArrowTip();
      const knee = getKnee();
      if (!defaults || !arrowTip || !knee) return;

      const textBox = clampTextBox(tb);
      const connectionPoint = computeCalloutConnectionPoint(knee, textBox);
      const calloutLine = [arrowTip, knee, connectionPoint];
      const overallRect = computeCalloutOverallRect(
        textBox,
        calloutLine,
        defaults.lineEnding,
        defaults.strokeWidth,
      );
      const rd = computeRDFromTextBox(overallRect, textBox);

      const anno: PdfFreeTextAnnoObject = {
        ...defaults,
        type: PdfAnnotationSubtype.FREETEXT,
        intent: 'FreeTextCallout',
        rect: overallRect,
        rectangleDifferences: rd,
        calloutLine,
        pageIndex,
        id: uuidV4(),
        created: new Date(),
      };

      onCommit(anno);
      resetState();
    };

    const resetState = () => {
      setPhase('arrow');
      setArrowTip(null);
      setKnee(null);
      setDownPos(null);
      setTextBoxStart(null);
      setDragging(false);
      onPreview(null);
    };

    return {
      onPointerDown: (pos, evt) => {
        const clampedPos = clampToPage(pos);
        const phase = getPhase();

        if (phase === 'arrow' || phase === 'knee') {
          setDownPos(clampedPos);
          evt.setPointerCapture?.();
        } else if (phase === 'textbox') {
          setTextBoxStart(clampedPos);
          setDragging(true);
          evt.setPointerCapture?.();
        }
      },
      onPointerMove: (pos) => {
        const clampedPos = clampToPage(pos);
        const phase = getPhase();

        if (phase === 'textbox' && getDragging()) {
          onPreview(buildPreview(clampedPos));
        } else if (phase === 'knee' || phase === 'textbox') {
          onPreview(buildPreview(clampedPos));
        }
      },
      onPointerUp: (pos, evt) => {
        const clampedPos = clampToPage(pos);
        const phase = getPhase();
        const downPos = getDownPos();

        if (phase === 'arrow' && downPos && isClick(downPos, clampedPos)) {
          setArrowTip(clampedPos);
          setPhase('knee');
          setDownPos(null);
          evt.releasePointerCapture?.();
          return;
        }

        if (phase === 'knee' && downPos && isClick(downPos, clampedPos)) {
          setKnee(clampedPos);
          setPhase('textbox');
          setDownPos(null);
          evt.releasePointerCapture?.();
          return;
        }

        if (phase === 'textbox' && getDragging()) {
          const tbStart = getTextBoxStart();
          if (tbStart) {
            const minX = Math.min(tbStart.x, clampedPos.x);
            const minY = Math.min(tbStart.y, clampedPos.y);
            const w = Math.abs(clampedPos.x - tbStart.x);
            const h = Math.abs(clampedPos.y - tbStart.y);

            if (w > 5 || h > 5) {
              const textBox: Rect = {
                origin: { x: minX, y: minY },
                size: { width: Math.max(w, 20), height: Math.max(h, 14) },
              };
              commitCallout(textBox);
            } else {
              commitCallout({
                origin: {
                  x: tbStart.x - DEFAULT_TB_WIDTH / 2,
                  y: tbStart.y - DEFAULT_TB_HEIGHT / 2,
                },
                size: { width: DEFAULT_TB_WIDTH, height: DEFAULT_TB_HEIGHT },
              });
            }
          }
          evt.releasePointerCapture?.();
          return;
        }

        setDownPos(null);
        evt.releasePointerCapture?.();
      },
      onPointerCancel: (_, evt) => {
        resetState();
        evt.releasePointerCapture?.();
      },
    };
  },
};
