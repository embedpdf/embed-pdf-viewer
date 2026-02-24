'use client'
import { useVueMount } from '../use-vue-mount'

export const ViewportExample = () => {
  const { containerRef } = useVueMount(
    () => import('@embedpdf/example-vue-tailwind/headless/viewport-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
