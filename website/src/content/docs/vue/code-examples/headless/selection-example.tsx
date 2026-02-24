'use client'
import { useVueMount } from '../use-vue-mount'

export const SelectionExample = () => {
  const { containerRef } = useVueMount(
    () => import('@embedpdf/example-vue-tailwind/headless/selection-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
