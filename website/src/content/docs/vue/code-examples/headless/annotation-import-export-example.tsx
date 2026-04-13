'use client'
import { useVueMount } from '../use-vue-mount'

export const ImportExportExample = () => {
  const { containerRef } = useVueMount(
    () =>
      import('@embedpdf/example-vue-tailwind/headless/annotation-import-export-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
