'use client'
import { useSvelteMount } from '../use-svelte-mount'

export const EngineExample = () => {
  const { containerRef } = useSvelteMount(
    () => import('@embedpdf/example-svelte-tailwind/viewer/engine-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
