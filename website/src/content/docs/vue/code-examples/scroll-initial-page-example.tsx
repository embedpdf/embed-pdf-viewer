'use client'
import { useVueMount } from './use-vue-mount'

export const ScrollInitialPageExample = () => {
  const containerRef = useVueMount(
    () => import('@embedpdf/example-vue-tailwind/scroll-initial-page-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
