'use client'
import { useSvelteMount } from './use-svelte-mount'

export const I18nExample = () => {
  const containerRef = useSvelteMount(
    () => import('@embedpdf/example-svelte-tailwind/i18n-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
