'use client'
import { useAngularMount } from '../use-angular-mount'

export const I18nExample = () => {
  const { containerRef } = useAngularMount(
    () => import('@embedpdf/example-angular-tailwind/viewer/i18n-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
