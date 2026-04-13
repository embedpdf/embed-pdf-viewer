'use client'
import { useVueMount } from '../use-vue-mount'

export const StampExample = () => {
  const { containerRef } = useVueMount(
    () => import('@embedpdf/example-vue-tailwind/headless/stamp-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
