'use client'
import { useVueMount } from '../use-vue-mount'

export const RedactionExample = () => {
  const { containerRef } = useVueMount(
    () => import('@embedpdf/example-vue-tailwind/headless/redaction-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
