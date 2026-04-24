import {
  PdfAnnotationBorderStyle,
  PdfAnnotationSubtype,
  PdfStandardFont,
  PdfTextAlignment,
  PdfVerticalAlignment,
  type PdfAnnotationObject,
  type PdfFreeTextAnnoObject,
  type PdfLineAnnoObject,
  type PdfSquareAnnoObject,
} from '@embedpdf/models';

export const DEMO_PAGE_INDEX = 0;

const PRIMARY_ID = 'annotation-flags-demo-primary';
const SECONDARY_ID = 'annotation-flags-demo-secondary';
const SQUARE_ID = 'annotation-flags-demo-square';
const LINE_ID = 'annotation-flags-demo-line';

const primarySeed: PdfFreeTextAnnoObject = {
  id: PRIMARY_ID,
  type: PdfAnnotationSubtype.FREETEXT,
  pageIndex: DEMO_PAGE_INDEX,
  rect: {
    origin: { x: 60, y: 80 },
    size: { width: 280, height: 72 },
  },
  contents: 'Primary note — try hidden, readOnly, locked, lockedContents',
  fontFamily: PdfStandardFont.Helvetica,
  fontSize: 13,
  fontColor: '#0F172A',
  textAlign: PdfTextAlignment.Left,
  verticalAlign: PdfVerticalAlignment.Top,
  color: '#FEF3C7',
  opacity: 1,
  flags: [],
};

const secondarySeed: PdfFreeTextAnnoObject = {
  id: SECONDARY_ID,
  type: PdfAnnotationSubtype.FREETEXT,
  pageIndex: DEMO_PAGE_INDEX,
  rect: {
    origin: { x: 360, y: 220 },
    size: { width: 130, height: 40 },
  },
  contents: 'Pinned note',
  fontFamily: PdfStandardFont.Helvetica,
  fontSize: 12,
  fontColor: '#0F172A',
  textAlign: PdfTextAlignment.Center,
  verticalAlign: PdfVerticalAlignment.Middle,
  color: '#BAE6FD',
  opacity: 1,
  flags: [],
};

const squareSeed: PdfSquareAnnoObject = {
  id: SQUARE_ID,
  type: PdfAnnotationSubtype.SQUARE,
  pageIndex: DEMO_PAGE_INDEX,
  rect: {
    origin: { x: 80, y: 300 },
    size: { width: 140, height: 90 },
  },
  color: 'transparent',
  opacity: 1,
  strokeWidth: 2,
  strokeColor: '#2563EB',
  strokeStyle: PdfAnnotationBorderStyle.SOLID,
  flags: [],
};

const lineSeed: PdfLineAnnoObject = {
  id: LINE_ID,
  type: PdfAnnotationSubtype.LINE,
  pageIndex: DEMO_PAGE_INDEX,
  rect: {
    origin: { x: 260, y: 320 },
    size: { width: 200, height: 60 },
  },
  linePoints: {
    start: { x: 260, y: 320 },
    end: { x: 460, y: 380 },
  },
  color: 'transparent',
  opacity: 1,
  strokeWidth: 2,
  strokeColor: '#DC2626',
  strokeStyle: PdfAnnotationBorderStyle.SOLID,
  flags: [],
};

export type DemoAnnotation = {
  id: string;
  label: string;
  seed: PdfAnnotationObject;
};

export const DEMO_ANNOTATIONS: DemoAnnotation[] = [
  { id: PRIMARY_ID, label: 'Primary note (FreeText)', seed: primarySeed },
  { id: SECONDARY_ID, label: 'Pinned note (FreeText)', seed: secondarySeed },
  { id: SQUARE_ID, label: 'Square outline', seed: squareSeed },
  { id: LINE_ID, label: 'Line', seed: lineSeed },
];
