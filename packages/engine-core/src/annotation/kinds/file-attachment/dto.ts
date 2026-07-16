import type { AttachmentFileInfo } from '../../../dto/Attachment';
import type { AnnotationBase } from '../../base';
import type { ColorStyleFields } from '../style.shared';
import type { FileAttachmentIcon } from './draft';

/**
 * FileAttachment annotation. The DTO carries the attached file's METADATA
 * only — bytes never ride a listing. Download them explicitly via
 * `PageAnnotationsService.downloadFile(ref)`.
 */
export type FileAttachmentAnnotationDTO = AnnotationBase &
  ColorStyleFields & {
    subtype: 'file-attachment';
    /** `/Name` icon; an absent `/Name` reads as `'push-pin'` (the ISO default). */
    icon: FileAttachmentIcon;
    /** Metadata of the attached file (`/FS` filespec projection). */
    file: AttachmentFileInfo;
  };
