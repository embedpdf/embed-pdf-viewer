'use client'
import { useVueMount } from '../use-vue-mount'

export const FormExample = () => {
  const { containerRef } = useVueMount(
    () => import('@embedpdf/example-vue-tailwind/viewer/form-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
