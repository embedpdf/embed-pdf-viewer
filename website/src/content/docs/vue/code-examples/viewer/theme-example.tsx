'use client'
import { useVueMount } from '../use-vue-mount'

export const ThemeExample = () => {
  const { containerRef } = useVueMount(
    () => import('@embedpdf/example-vue-tailwind/viewer/theme-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
