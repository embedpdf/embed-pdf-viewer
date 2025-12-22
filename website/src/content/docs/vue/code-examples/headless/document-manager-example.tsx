'use client'
import { useVueMount } from '../use-vue-mount'

export const DocumentManagerExample = () => {
  const { containerRef } = useVueMount(
    () =>
      import('@embedpdf/example-vue-tailwind/headless/document-manager-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
