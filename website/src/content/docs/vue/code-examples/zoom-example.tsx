'use client'
import { useVueMount } from './use-vue-mount'

export const ZoomExample = () => {
  const containerRef = useVueMount(
    () => import('@embedpdf/example-vue-tailwind/zoom-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
