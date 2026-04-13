'use client'
import { useVueMount } from '../use-vue-mount'

export const FormEditModeExample = () => {
  const { containerRef } = useVueMount(
    () =>
      import('@embedpdf/example-vue-tailwind/headless/form-edit-mode-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
