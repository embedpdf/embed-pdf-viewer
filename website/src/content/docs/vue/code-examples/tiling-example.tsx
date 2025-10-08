'use client'
import { useVueMount } from './use-vue-mount'

export const TilingExample = () => {
  const containerRef = useVueMount(
    () => import('@embedpdf/example-vue-tailwind/tiling-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
