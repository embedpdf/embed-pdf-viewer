'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useTheme } from 'next-themes'
import type { EmbedPdfContainer } from '@embedpdf/snippet'

interface PDFViewerProps {
  style?: React.CSSProperties
  className?: string
}

export default function PDFViewer({ style, className }: PDFViewerProps) {
  const [isClient, setIsClient] = useState(false)
  const viewerRef = useRef<HTMLDivElement>(null)
  const embedPdfRef = useRef<EmbedPdfContainer | null>(null)
  const { resolvedTheme } = useTheme()

  // Ensure we're on the client side
  useEffect(() => {
    setIsClient(true)
  }, [])

  // Load EmbedPDF only on client side
  useEffect(() => {
    if (!isClient || !viewerRef.current) return

    const loadEmbedPDF = async () => {
      try {
        // Dynamic import to avoid SSR issues
        const EmbedPDF = (await import('@embedpdf/snippet')).default

        const viewer = EmbedPDF.init({
          type: 'container',
          target: viewerRef.current!,
          src: 'https://snippet.embedpdf.com/ebook.pdf',
          worker: true,
          theme: {
            // Use 'system' to follow OS preference, or sync with Next.js theme
            preference: resolvedTheme === 'dark' ? 'dark' : 'light',
          },
        })

        if (viewer) {
          embedPdfRef.current = viewer
        }
      } catch (error) {
        console.error('Failed to load EmbedPDF:', error)
      }
    }

    loadEmbedPDF()
  }, [isClient])

  // Sync theme with Next.js theme changes
  useEffect(() => {
    if (embedPdfRef.current && resolvedTheme) {
      embedPdfRef.current.setTheme(resolvedTheme === 'dark' ? 'dark' : 'light')
    }
  }, [resolvedTheme])

  // Show loading state during SSR and initial client render
  if (!isClient) {
    return (
      <div
        style={{
          height: '600px',
          border: '1px solid #ccc',
          borderRadius: '10px',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#f5f5f5',
        }}
      >
        <div>Loading PDF Viewer...</div>
      </div>
    )
  }

  return (
    <div
      id="pdf-viewer"
      className={className}
      style={{
        ...style,
      }}
      ref={viewerRef}
    />
  )
}
