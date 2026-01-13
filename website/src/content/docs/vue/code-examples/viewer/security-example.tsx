'use client'
import { useVueMount } from '../use-vue-mount'

export const SecurityViewerExample = () => {
  const { containerRef } = useVueMount(
    () => import('@embedpdf/example-vue-tailwind/viewer/security-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
