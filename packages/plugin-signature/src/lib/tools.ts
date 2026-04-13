import { PdfAnnotationSubtype } from '@embedpdf/models';
import { defineAnnotationTool, patching } from '@embedpdf/plugin-annotation';
import { signatureStampHandlerFactory } from './handlers/signature-stamp.handler';
import { signatureInkHandlerFactory } from './handlers/signature-ink.handler';

export const SIGNATURE_STAMP_TOOL_ID = 'signatureStamp' as const;
export const SIGNATURE_INK_TOOL_ID = 'signatureInk' as const;

export const signatureStampTool = defineAnnotationTool({
  id: SIGNATURE_STAMP_TOOL_ID,
  name: 'Signature Stamp',
  labelKey: 'signature.stamp',
  categories: ['annotation', 'signature', 'insert'],
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
  pointerHandler: signatureStampHandlerFactory,
});

export const signatureInkTool = defineAnnotationTool({
  id: SIGNATURE_INK_TOOL_ID,
  name: 'Signature Ink',
  labelKey: 'signature.ink',
  categories: ['annotation', 'signature', 'insert'],
  matchScore: (a) => (a.type === PdfAnnotationSubtype.INK && a.subject === 'Signature' ? 20 : 0),
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
    type: PdfAnnotationSubtype.INK,
  },
  behavior: {
    deactivateToolAfterCreate: true,
    selectAfterCreate: true,
  },
  transform: patching.patchInk,
  pointerHandler: signatureInkHandlerFactory,
});

export const signatureTools = [signatureStampTool, signatureInkTool];
