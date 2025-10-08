'use client'
import { useVueMount } from './use-vue-mount'

export const SpreadExample = () => {
  const containerRef = useVueMount(
    () => import('@embedpdf/example-vue-tailwind/spread-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
