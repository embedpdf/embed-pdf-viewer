'use client'
import { useSvelteMount } from '../use-svelte-mount'

export const FormEditModeExample = () => {
  const { containerRef } = useSvelteMount(
    () =>
      import('@embedpdf/example-svelte-tailwind/headless/form-edit-mode-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
