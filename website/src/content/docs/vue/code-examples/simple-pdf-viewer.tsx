'use client'
import { useVueMount } from './use-vue-mount'

export const SimplePdfViewer = () => {
  const containerRef = useVueMount(
    () => import('@embedpdf/example-vue-tailwind/simple-pdf-viewer'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
