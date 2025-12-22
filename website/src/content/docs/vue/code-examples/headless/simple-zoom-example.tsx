'use client'
import { useVueMount } from '../use-vue-mount'

export const SimpleZoomExample = () => {
  const { containerRef } = useVueMount(
    () => import('@embedpdf/example-vue-tailwind/headless/simple-zoom-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
