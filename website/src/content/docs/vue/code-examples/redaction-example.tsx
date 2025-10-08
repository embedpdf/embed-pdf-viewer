'use client'
import { useVueMount } from './use-vue-mount'

export const RedactionExample = () => {
  const containerRef = useVueMount(
    () => import('@embedpdf/example-vue-tailwind/redaction-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
