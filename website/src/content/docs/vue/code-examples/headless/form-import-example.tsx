'use client'
import { useVueMount } from '../use-vue-mount'

export const FormImportExample = () => {
  const { containerRef } = useVueMount(
    () => import('@embedpdf/example-vue-tailwind/headless/form-import-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
