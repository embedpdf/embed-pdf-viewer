'use client'
import { useSvelteMount } from '../use-svelte-mount'

export const SignatureExample = () => {
  const { containerRef } = useSvelteMount(
    () => import('@embedpdf/example-svelte-tailwind/viewer/signature-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
