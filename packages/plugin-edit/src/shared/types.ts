import { PdfTextBlock, Rect } from '@embedpdf/models';

export interface TextBlockRenderProps {
  block: PdfTextBlock;
  blockIndex: number;
  isSelected: boolean;
  offset: { x: number; y: number } | null;
  scale: number;
}

export interface EditLayerProps {
  documentId: string;
  pageIndex: number;
  scale?: number;
  rotation?: number;
}
