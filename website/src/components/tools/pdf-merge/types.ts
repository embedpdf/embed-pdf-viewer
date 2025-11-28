import { PdfDocumentObject } from '@embedpdf/models'

/**
 * Represents a page in a source document
 */
export type DocumentPage = {
  docId: string
  pageIndex: number
  thumbnail?: string
  selected?: boolean
}

/**
 * Represents a page in the merged document
 */
export type MergeDocPage = {
  id: string
  docId: string
  pageIndex: number
  thumbnail?: string
}

/**
 * Representation of a PDF document with its pages
 */
export type DocumentWithPages = {
  doc: PdfDocumentObject
  fileName: string
  pages: DocumentPage[]
}
