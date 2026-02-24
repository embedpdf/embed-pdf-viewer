'use client'

import { PDFViewer } from '@embedpdf/react-pdf-viewer'

export const SecurityViewerExample = () => {
  return (
    <div className="h-[600px] overflow-hidden rounded-lg border border-gray-200 shadow-sm dark:border-gray-700">
      <PDFViewer
        config={{
          tabBar: 'always',
          documentManager: {
            initialDocuments: [
              {
                url: 'https://snippet.embedpdf.com/ebook.pdf',
                name: 'Full Access',
                permissions: {
                  enforceDocumentPermissions: false,
                },
              },
              {
                url: 'https://snippet.embedpdf.com/ebook.pdf',
                name: 'Print Disabled',
                autoActivate: false,
                permissions: {
                  enforceDocumentPermissions: false,
                  overrides: {
                    print: false,
                    printHighQuality: false,
                  },
                },
              },
              {
                url: 'https://snippet.embedpdf.com/ebook.pdf',
                name: 'Read-Only',
                autoActivate: false,
                permissions: {
                  enforceDocumentPermissions: false,
                  overrides: {
                    print: false,
                    printHighQuality: false,
                    copyContents: false,
                    modifyContents: false,
                    modifyAnnotations: false,
                  },
                },
              },
            ],
          },
        }}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  )
}
