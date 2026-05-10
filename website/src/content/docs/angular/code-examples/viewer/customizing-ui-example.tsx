'use client'
import { useAngularMount } from '../use-angular-mount'

export const CustomizingUiExample = () => {
  const { containerRef } = useAngularMount(
    () =>
      import('@embedpdf/example-angular-tailwind/viewer/customizing-ui-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
