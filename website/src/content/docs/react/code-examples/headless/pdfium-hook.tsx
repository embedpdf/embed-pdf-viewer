'use client'

import { usePdfiumEngine } from '@embedpdf/engines/react'

export default function LoadingPDFiumExample() {
  const { isLoading, error, engine } = usePdfiumEngine()

  if (error) {
    return (
      <div className="mt-3 rounded-md bg-red-50 p-4 text-sm font-medium text-red-800">
        Failed to load PDF engine: {error.message}
      </div>
    )
  }

  if (isLoading || !engine) {
    return (
      <div className="mt-3 rounded-md bg-yellow-50 p-4 text-sm font-medium text-yellow-800">
        Loading PDF engine...
      </div>
    )
  }

  // Engine is ready to use immediately!
  return (
    <div className="mt-3 rounded-md bg-green-50 p-4 text-sm font-medium text-green-800">
      Engine loaded successfully!
    </div>
  )
}
