'use client'
import { useVueMount } from './use-vue-mount'

export const ExportExample = () => {
  const containerRef = useVueMount(
    () => import('@embedpdf/example-vue-tailwind/export-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
