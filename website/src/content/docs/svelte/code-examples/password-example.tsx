'use client'
import { useSvelteMount } from './use-svelte-mount'

export const PasswordExample = () => {
  const containerRef = useSvelteMount(
    () => import('@embedpdf/example-svelte-tailwind/password-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
