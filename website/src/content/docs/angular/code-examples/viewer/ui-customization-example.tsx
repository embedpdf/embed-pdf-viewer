'use client'
import { useAngularMount } from '../use-angular-mount'

export const UiCustomizationExample = () => {
  const { containerRef } = useAngularMount(
    () =>
      import('@embedpdf/example-angular-tailwind/viewer/ui-customization-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
