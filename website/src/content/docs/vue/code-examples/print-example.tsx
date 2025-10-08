'use client'
import { useVueMount } from './use-vue-mount'

export const PrintExample = () => {
  const containerRef = useVueMount(
    () => import('@embedpdf/example-vue-tailwind/print-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
