'use client'
import { useVueMount } from '../use-vue-mount'

export const SignatureExample = () => {
  const { containerRef } = useVueMount(
    () => import('@embedpdf/example-vue-tailwind/headless/signature-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
