'use client'
import { useVueMount } from './use-vue-mount'

export const SimpleZoomExample = () => {
  const containerRef = useVueMount(
    () => import('@embedpdf/example-vue-tailwind/simple-zoom-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
