import { PdfAttachmentObject } from '@embedpdf/models'

export interface EditableAttachment extends PdfAttachmentObject {
  id: string
  isMarkedForDeletion?: boolean
}
