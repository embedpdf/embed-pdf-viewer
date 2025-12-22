'use client'
import { useVueMount } from '../use-vue-mount'

export const SimplePdfViewer = () => {
  const containerRef = useVueMount(
    () => import('@embedpdf/example-vue-tailwind/headless/simple-pdf-viewer'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
