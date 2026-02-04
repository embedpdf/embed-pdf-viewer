'use client'
import { useVueMount } from '../use-vue-mount'

export const I18nExample = () => {
  const { containerRef } = useVueMount(
    () => import('@embedpdf/example-vue-tailwind/viewer/i18n-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
