'use client'
import { useVueMount } from '../use-vue-mount'

export const UiCustomizationExample = () => {
  const { containerRef } = useVueMount(
    () =>
      import('@embedpdf/example-vue-tailwind/viewer/ui-customization-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
