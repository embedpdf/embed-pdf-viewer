'use client'
import { useVueMount } from './use-vue-mount'

export const RotateExample = () => {
  const containerRef = useVueMount(
    () => import('@embedpdf/example-vue-tailwind/rotate-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
