'use client'
import { useSvelteMount } from '../use-svelte-mount'

export const FormExample = () => {
  const { containerRef } = useSvelteMount(
    () => import('@embedpdf/example-svelte-tailwind/viewer/form-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
