'use client'
import { useSvelteMount } from '../use-svelte-mount'

export const AnnotationImportExportExample = () => {
  const { containerRef } = useSvelteMount(
    () =>
      import('@embedpdf/example-svelte-tailwind/viewer/annotation-import-export-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
