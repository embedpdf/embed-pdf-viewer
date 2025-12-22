'use client'
import { useVueMount } from '../use-vue-mount'

export const RenderExample = () => {
  const containerRef = useVueMount(
    () => import('@embedpdf/example-vue-tailwind/headless/render-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
