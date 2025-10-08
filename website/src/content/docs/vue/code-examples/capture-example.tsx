'use client'
import { useVueMount } from './use-vue-mount'

export const CaptureExample = () => {
  const containerRef = useVueMount(
    () => import('@embedpdf/example-vue-tailwind/capture-example'),
  )

  // Add suppressHydrationWarning to prevent the warning
  return <div ref={containerRef} suppressHydrationWarning />
}
