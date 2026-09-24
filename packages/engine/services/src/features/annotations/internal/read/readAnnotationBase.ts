import type {
  AnnotationBase,
  PageObjectNumber,
  RevisionToken,
  PdfAnnotationActions,
} from '@embedpdf/engine-core/runtime';
import { toPageRef } from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import { readAnnotFlags, readAnnotRect, readAnnotString } from './annotationReadPrimitives';
import { readAnnotationIdentity } from './readAnnotationIdentity';
import { readAnnotationRelationship, readLinkedAnnotationRef } from './readAnnotationRelationship';
import { readEmbedMetadata } from './readEmbedMetadata';
import { pdfDateToIso } from '../../../../shared/pdf-date';
import { ActionReadBudgetTracker, readActionModel } from '../../../actions/ActionModelReader';
import { blendModeFromCode } from '../blendMode';

/**
 * Reads the fields every annotation DTO carries: identity, flags, rect,
 * contents, relationships, attribution and actions, each present and `null`
 * when absent. No subtype-specific fields. The per-subtype reader builds its
 * DTO by extending this with its own fields and `subtype: '...'`
 * discriminator.
 */
export function readAnnotationBase(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  docPtr: Ptr,
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
  const subject = readAnnotString(fn, mem, annotPtr, 'Subj');
  const author = readAnnotString(fn, mem, annotPtr, 'T');
  const createdRaw = readAnnotString(fn, mem, annotPtr, 'CreationDate');
  const modifiedRaw = readAnnotString(fn, mem, annotPtr, 'M');
  const blendMode = blendModeFromCode(fn.EPDFAnnot_GetBlendMode(annotPtr));
  // /EMBD_Metadata is absent for anonymous annotations and those written by other tools.
  const embd = readEmbedMetadata(fn, mem, annotPtr);
  const relationship = readAnnotationRelationship(fn, mem, annotPtr, pageObjectNumber);
  const popup = readLinkedAnnotationRef(fn, mem, annotPtr, 'Popup', pageObjectNumber);
  const actions = readAnnotationActions(fn, mem, docPtr, annotPtr, actionBudget);

  return {
    ref: identity.ref,
    page: toPageRef(pageObjectNumber),
    index,
    identityQuality: identity.identityQuality,
    nm: identity.nm,
    ...flags,
    rect,
    contents,
    subject,
    author,
    created: createdRaw ? pdfDateToIso(createdRaw) : null,
    modified: modifiedRaw ? pdfDateToIso(modifiedRaw) : null,
    blendMode,
    reply: relationship.inReplyTo
      ? { to: relationship.inReplyTo, type: relationship.replyType ?? 'reply' }
      : null,
    popup,
    groupId: embd?.groupId ?? null,
    userId: embd?.userId ?? null,
    createdBy: embd?.createdBy ?? null,
    updatedBy: embd?.updatedBy ?? null,
    importedBy: embd?.importedBy ?? null,
    actions: actions ?? null,
  };
}

function readAnnotationActions(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  docPtr: Ptr,
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
    const action = readActionModel(
      fn,
      mem,
      docPtr,
      fn.EPDFAnnot_GetActionModel(annotPtr, event),
      budget,
    );
    if (action) actions[key] = action;
  }
  return Object.keys(actions).length > 0 ? actions : undefined;
}
