import { PdfAnnotationObject, PdfAnnotationSubtype, PdfPolygonAnnoObject } from '@embedpdf/models';
import {
  isSidebarAnnotation,
  SidebarSubtype,
  TrackedAnnotation,
} from '@embedpdf/plugin-annotation';

// Annotation type configuration
export interface AnnotationConfig {
  label: string;
  labelKey: string;
  icon: string;
  iconProps: (annotation: PdfAnnotationObject) => {
    primaryColor?: string;
    secondaryColor?: string;
    size?: number;
    strokeWidth?: number;
  };
}

export const annotationConfigs: Record<SidebarSubtype, AnnotationConfig> = {
  [PdfAnnotationSubtype.HIGHLIGHT]: {
    label: 'Highlight',
    labelKey: 'annotation.highlight',
    icon: 'highlight',
    iconProps: (annotation: any) => ({
      primaryColor: annotation.color || '#ffff00',
    }),
  },
  [PdfAnnotationSubtype.CIRCLE]: {
    label: 'Circle',
    labelKey: 'annotation.circle',
    icon: 'circle',
    iconProps: (annotation: any) => ({
      primaryColor: annotation.strokeColor || '#000000',
      secondaryColor: annotation.color,
    }),
  },
  [PdfAnnotationSubtype.SQUARE]: {
    label: 'Square',
    labelKey: 'annotation.square',
    icon: 'square',
    iconProps: (annotation: any) => ({
      primaryColor: annotation.strokeColor || '#000000',
      secondaryColor: annotation.color,
    }),
  },
  [PdfAnnotationSubtype.LINE]: {
    label: 'Line',
    labelKey: 'annotation.line',
    icon: 'line',
    iconProps: (annotation: any) => ({
      primaryColor: annotation.strokeColor || '#000000',
    }),
  },
  [PdfAnnotationSubtype.UNDERLINE]: {
    label: 'Underline',
    labelKey: 'annotation.underline',
    icon: 'underline',
    iconProps: (annotation: any) => ({
      primaryColor: annotation.color || '#000000',
    }),
  },
  [PdfAnnotationSubtype.SQUIGGLY]: {
    label: 'Squiggly',
    labelKey: 'annotation.squiggly',
    icon: 'squiggly',
    iconProps: (annotation: any) => ({
      primaryColor: annotation.color || '#000000',
    }),
  },
  [PdfAnnotationSubtype.STRIKEOUT]: {
    label: 'Strikethrough',
    labelKey: 'annotation.strikeout',
    icon: 'strikethrough',
    iconProps: (annotation: any) => ({
      primaryColor: annotation.color || '#000000',
    }),
  },
  [PdfAnnotationSubtype.INK]: {
    label: 'Ink',
    labelKey: 'annotation.ink',
    icon: 'pencilMarker',
    iconProps: (annotation: any) => ({
      primaryColor: annotation.color || '#000000',
    }),
  },
  [PdfAnnotationSubtype.FREETEXT]: {
    label: 'Text',
    labelKey: 'annotation.freeText',
    icon: 'text',
    iconProps: (annotation: any) => ({
      primaryColor: annotation.fontColor || '#000000',
    }),
  },
  [PdfAnnotationSubtype.POLYGON]: {
    label: 'Polygon',
    labelKey: 'annotation.polygon',
    icon: 'polygon',
    iconProps: (annotation: any) => ({
      primaryColor: annotation.strokeColor || '#000000',
      secondaryColor: annotation.color,
    }),
  },
  [PdfAnnotationSubtype.POLYLINE]: {
    label: 'Polyline',
    labelKey: 'annotation.polyline',
    icon: 'zigzag',
    iconProps: (annotation: any) => ({
      primaryColor: annotation.strokeColor || '#000000',
    }),
  },
  [PdfAnnotationSubtype.STAMP]: {
    label: 'Stamp',
    labelKey: 'annotation.stamp',
    icon: 'deviceFloppy',
    iconProps: () => ({
      primaryColor: '#dc2626',
    }),
  },
};

export const getAnnotationConfig = (annotation: TrackedAnnotation): AnnotationConfig | null => {
  if (!isSidebarAnnotation(annotation)) {
    return null;
  }
  return annotationConfigs[annotation.object.type];
};
