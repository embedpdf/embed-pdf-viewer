'use client'
import { useVueMount } from './use-vue-mount'

export const ScrollExample = () => {
  const containerRef = useVueMount(
    () => import('@embedpdf/example-vue-tailwind/scroll-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
