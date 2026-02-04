'use client'
import { useVueMount } from '../use-vue-mount'

export const DisableCategoriesExample = () => {
  const { containerRef } = useVueMount(
    () =>
      import('@embedpdf/example-vue-tailwind/viewer/disable-categories-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
