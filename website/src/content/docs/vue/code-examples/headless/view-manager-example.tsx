'use client'
import { useVueMount } from '../use-vue-mount'

export const ViewManagerExample = () => {
  const { containerRef } = useVueMount(
    () =>
      import('@embedpdf/example-vue-tailwind/headless/view-manager-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
