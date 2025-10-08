'use client'
import { useVueMount } from './use-vue-mount'

export const PanExample = () => {
  const containerRef = useVueMount(
    () => import('@embedpdf/example-vue-tailwind/pan-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
