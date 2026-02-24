'use client'
import { useVueMount } from '../use-vue-mount'

export const DocumentLoadingExample = () => {
  const { containerRef } = useVueMount(
    () =>
      import('@embedpdf/example-vue-tailwind/viewer/document-loading-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
