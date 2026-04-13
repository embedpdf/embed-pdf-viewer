'use client'
import { useVueMount } from '../use-vue-mount'

export const AnnotationImportExportExample = () => {
  const { containerRef } = useVueMount(
    () =>
      import('@embedpdf/example-vue-tailwind/viewer/annotation-import-export-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
