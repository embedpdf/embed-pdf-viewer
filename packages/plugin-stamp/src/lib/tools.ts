import { PdfAnnotationSubtype } from '@embedpdf/models';
import { defineAnnotationTool } from '@embedpdf/plugin-annotation';
import { rubberStampHandlerFactory } from './handlers/rubber-stamp.handler';

export const RUBBER_STAMP_TOOL_ID = 'rubberStamp' as const;

export const rubberStampTool = defineAnnotationTool({
  id: RUBBER_STAMP_TOOL_ID,
  name: 'Rubber Stamp',
  labelKey: 'stamp.rubberStamp',
  categories: ['annotation', 'stamp', 'insert'],
  matchScore: () => 0,
  interaction: {
    exclusive: true,
    cursor: 'copy',
    isDraggable: true,
    isResizable: true,
    isRotatable: false,
    lockAspectRatio: true,
    isGroupDraggable: true,
    isGroupResizable: false,
    isGroupRotatable: false,
  },
  defaults: {
    type: PdfAnnotationSubtype.STAMP,
  },
  behavior: {
    deactivateToolAfterCreate: true,
    selectAfterCreate: true,
    insertUpright: true,
    useAppearanceStream: true,
  },
  pointerHandler: rubberStampHandlerFactory,
});

export const stampTools = [rubberStampTool];
