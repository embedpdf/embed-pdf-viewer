'use client'
import { useSvelteMount } from '../use-svelte-mount'

export const FormImportExample = () => {
  const { containerRef } = useSvelteMount(
    () =>
      import('@embedpdf/example-svelte-tailwind/headless/form-import-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
