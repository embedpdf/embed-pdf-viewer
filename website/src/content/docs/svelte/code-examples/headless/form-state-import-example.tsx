'use client'
import { useSvelteMount } from '../use-svelte-mount'

export const FormStateImportExample = () => {
  const { containerRef } = useSvelteMount(
    () =>
      import('@embedpdf/example-svelte-tailwind/headless/form-state-import-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
