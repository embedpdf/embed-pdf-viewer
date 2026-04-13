'use client'
import { useVueMount } from '../use-vue-mount'

export const FormExample = () => {
  const { containerRef } = useVueMount(
    () => import('@embedpdf/example-vue-tailwind/headless/form-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
