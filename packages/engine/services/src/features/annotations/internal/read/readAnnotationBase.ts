import type {
  AnnotationBase,
  PageObjectNumber,
  RevisionToken,
  PdfAnnotationActions,
} from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import { readAnnotFlags, readAnnotRect, readAnnotString } from './annotationReadPrimitives';
import { readAnnotationIdentity } from './readAnnotationIdentity';
import { readAnnotationRelationship } from './readAnnotationRelationship';
import { readEmbedMetadata } from './readEmbedMetadata';
import { blendModeFromCode } from '../blendMode';
import { pdfDateToIso } from '../../../../shared/pdf-date';
import { ActionReadBudgetTracker, readActionModel } from '../../../actions/ActionModelReader';

/**
 * Reads the wire shell every annotation DTO carries: identity, flags,
 * rect, contents, author, dates. No subtype-specific fields. The
 * per-subtype reader builds its DTO by extending this with its own
 * fields and `subtype: '...'` discriminator.
 */
export function readAnnotationBase(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  pageObjectNumber: PageObjectNumber,
  index: number,
  revision: RevisionToken,
  actionBudget = new ActionReadBudgetTracker(),
): AnnotationBase {
  const identity = readAnnotationIdentity(fn, mem, annotPtr, pageObjectNumber, index, revision);
  const rect = readAnnotRect(fn, mem, annotPtr);
  const flags = readAnnotFlags(fn, annotPtr);
  const contents = readAnnotString(fn, mem, annotPtr, 'Contents');
  const author = readAnnotString(fn, mem, annotPtr, 'T');
  const createdRaw = readAnnotString(fn, mem, annotPtr, 'CreationDate');
  const modifiedRaw = readAnnotString(fn, mem, annotPtr, 'M');
  const blendMode = blendModeFromCode(fn.EPDFAnnot_GetBlendMode(annotPtr));
  // EmbedPDF /EMBD_Metadata is optional; absent for legacy or anonymous
  // annotations. We spread the present fields into the DTO so the wire
  // never carries explicit `undefined` keys.
  const embd = readEmbedMetadata(fn, mem, annotPtr);
  const relationship = readAnnotationRelationship(fn, mem, annotPtr, pageObjectNumber);
  const actions = readAnnotationActions(fn, mem, annotPtr, actionBudget);

  return {
    ref: identity.ref,
    pageObjectNumber,
    index,
    identityQuality: identity.identityQuality,
    nm: identity.nm,
    flags,
    rect,
    contents,
    author,
    created: createdRaw ? pdfDateToIso(createdRaw) : null,
    modified: modifiedRaw ? pdfDateToIso(modifiedRaw) : null,
    blendMode,
    inReplyTo: relationship.inReplyTo,
    replyType: relationship.replyType,
    ...(embd?.userId !== undefined ? { userId: embd.userId } : {}),
    ...(embd?.groupId !== undefined ? { groupId: embd.groupId } : {}),
    ...(embd?.createdBy !== undefined ? { createdBy: embd.createdBy } : {}),
    ...(embd?.updatedBy !== undefined ? { updatedBy: embd.updatedBy } : {}),
    ...(actions ? { actions } : {}),
  };
}

function readAnnotationActions(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  budget: ActionReadBudgetTracker,
): PdfAnnotationActions | undefined {
  const events = [
    ['activate', 0],
    ['cursorEnter', 1],
    ['cursorExit', 2],
    ['mouseDown', 3],
    ['mouseUp', 4],
    ['focus', 5],
    ['blur', 6],
    ['pageOpen', 7],
    ['pageClose', 8],
    ['pageVisible', 9],
    ['pageInvisible', 10],
  ] as const;
  const actions: PdfAnnotationActions = {};
  for (const [key, event] of events) {
    const action = readActionModel(fn, mem, fn.EPDFAnnot_GetActionModel(annotPtr, event), budget);
    if (action) actions[key] = action;
  }
  return Object.keys(actions).length > 0 ? actions : undefined;
}
