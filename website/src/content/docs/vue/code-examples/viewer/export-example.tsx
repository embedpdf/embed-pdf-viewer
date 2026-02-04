'use client'
import { useVueMount } from '../use-vue-mount'

export const ExportExample = () => {
  const { containerRef } = useVueMount(
    () => import('@embedpdf/example-vue-tailwind/viewer/export-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
