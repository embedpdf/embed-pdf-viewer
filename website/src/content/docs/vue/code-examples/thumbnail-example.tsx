'use client'
import { useVueMount } from './use-vue-mount'

export const ThumbnailExample = () => {
  const containerRef = useVueMount(
    () => import('@embedpdf/example-vue-tailwind/thumbnail-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
