'use client'
import { useVueMount } from '../use-vue-mount'

export const CustomUIExample = () => {
  const { containerRef } = useVueMount(
    () =>
      import('@embedpdf/example-vue-tailwind/headless/annotation-custom-ui-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
