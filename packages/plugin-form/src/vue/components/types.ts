import type { Rect, PdfStandardFont } from '@embedpdf/models';

export interface WidgetPreviewData {
  rect: Rect;
  fontFamily?: PdfStandardFont;
  fontSize?: number;
  fontColor?: string;
}
