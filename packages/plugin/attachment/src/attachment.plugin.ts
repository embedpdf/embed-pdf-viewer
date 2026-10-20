import { definePlugin } from '@embedpdf/core';
import { AnnotationToken } from '@embedpdf/plugin-annotation/contract';
import { StageToken } from '@embedpdf/plugin-stage/contract';

import { AttachmentToken } from './contract';
import { createAttachmentController } from './controller';
import { initialAttachmentState } from './model';

/**
 * The files a document carries. Document-scoped; optionally uses the
 * annotations (a page's files, and removing and saving them) and the stage
 * (going to a page's file).
 */
export const attachmentPlugin = () =>
  definePlugin({
    id: 'attachment',
    token: AttachmentToken,
    scope: 'document',
    optional: [AnnotationToken, StageToken],
    state: initialAttachmentState,
    create: createAttachmentController,
  });
