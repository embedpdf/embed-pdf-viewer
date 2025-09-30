import { PdfBookmarkObject, PdfLinkTarget } from '@embedpdf/models'

export interface EditableBookmark extends PdfBookmarkObject {
  id: string
  parentId?: string
  isEditing?: boolean
  isExpanded?: boolean
  isNew?: boolean
}

export interface BookmarkFormData {
  title: string
  pageIndex: number
  zoom?: number
}

export interface DraggedBookmark {
  bookmark: EditableBookmark
  parentId?: string
}
