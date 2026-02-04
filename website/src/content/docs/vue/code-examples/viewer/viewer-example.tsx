'use client'
import { useVueMount } from '../use-vue-mount'

export const ViewerExample = () => {
  const { containerRef } = useVueMount(
    () => import('@embedpdf/example-vue-tailwind/viewer/viewer-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
