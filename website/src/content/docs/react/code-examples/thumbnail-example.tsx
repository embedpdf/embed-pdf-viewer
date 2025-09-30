'use client'

import { createPluginRegistration } from '@embedpdf/core'
import { EmbedPDF } from '@embedpdf/core/react'
import { usePdfiumEngine } from '@embedpdf/engines/react'
import {
  Viewport,
  ViewportPluginPackage,
} from '@embedpdf/plugin-viewport/react'
import {
  Scroller,
  ScrollPluginPackage,
  useScroll,
} from '@embedpdf/plugin-scroll/react'
import { LoaderPluginPackage } from '@embedpdf/plugin-loader/react'
import { RenderLayer, RenderPluginPackage } from '@embedpdf/plugin-render/react'
import {
  ThumbnailsPane,
  ThumbImg,
  ThumbnailPluginPackage,
} from '@embedpdf/plugin-thumbnail/react'

// 1. Register plugins, including Thumbnail and its dependencies
const plugins = [
  createPluginRegistration(LoaderPluginPackage, {
    loadingOptions: {
      type: 'url',
      pdfFile: {
        id: 'example-pdf',
        url: 'https://snippet.embedpdf.com/ebook.pdf',
      },
    },
  }),
  createPluginRegistration(ViewportPluginPackage),
  createPluginRegistration(ScrollPluginPackage),
  createPluginRegistration(RenderPluginPackage),
  createPluginRegistration(ThumbnailPluginPackage, {
    width: 120, // Width of the thumbnail images
    paddingY: 10, // Vertical padding for the sidebar
  }),
]

// 2. Create the Thumbnail Sidebar component
const ThumbnailSidebar = () => {
  const { state, provides } = useScroll()

  return (
    <div
      style={{
        width: '150px',
        height: '100%',
        backgroundColor: '#f8f9fa',
        borderRight: '1px solid #dee2e6',
      }}
    >
      <ThumbnailsPane>
        {(m) => {
          const isActive = state.currentPage === m.pageIndex + 1
          return (
            <div
              key={m.pageIndex}
              style={{
                position: 'absolute',
                width: '100%',
                height: m.wrapperHeight,
                top: m.top,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                cursor: 'pointer',
                padding: '4px',
              }}
              onClick={() => {
                provides?.scrollToPage?.({
                  pageNumber: m.pageIndex + 1,
                })
              }}
            >
              {/* Thumbnail image container */}
              <div
                style={{
                  width: m.width,
                  height: m.height,
                  border: `2px solid ${isActive ? '#0d6efd' : '#ced4da'}`,
                  borderRadius: '4px',
                  overflow: 'hidden',
                  boxShadow: isActive
                    ? '0 0 5px rgba(13, 110, 253, 0.5)'
                    : 'none',
                }}
              >
                <ThumbImg
                  meta={m}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                  }}
                />
              </div>
              {/* Page number label */}
              <div
                style={{
                  height: m.labelHeight,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginTop: '4px',
                }}
              >
                <span style={{ fontSize: '12px', color: '#6c757d' }}>
                  {m.pageIndex + 1}
                </span>
              </div>
            </div>
          )
        }}
      </ThumbnailsPane>
    </div>
  )
}

// 3. Create the main viewer component
export const PDFViewer = () => {
  const { engine, isLoading } = usePdfiumEngine()

  if (isLoading || !engine) {
    return <div>Loading PDF Engine...</div>
  }

  return (
    <div style={{ height: '500px', marginTop: '10px' }}>
      <EmbedPDF engine={engine} plugins={plugins}>
        <div style={{ display: 'flex', height: '100%' }}>
          <ThumbnailSidebar />
          <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
            <Viewport
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: '#f1f3f5',
              }}
            >
              <Scroller
                renderPage={({ width, height, pageIndex, scale }) => (
                  <div style={{ width, height, position: 'relative' }}>
                    <RenderLayer pageIndex={pageIndex} scale={scale} />
                  </div>
                )}
              />
            </Viewport>
          </div>
        </div>
      </EmbedPDF>
    </div>
  )
}
