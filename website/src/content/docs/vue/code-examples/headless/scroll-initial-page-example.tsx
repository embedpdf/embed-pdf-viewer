'use client'
import { useVueMount } from '../use-vue-mount'

export const ScrollInitialPageExample = () => {
  const { containerRef } = useVueMount(
    () =>
      import('@embedpdf/example-vue-tailwind/headless/scroll-initial-page-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
