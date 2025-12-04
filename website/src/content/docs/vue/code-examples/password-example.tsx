'use client'
import { useVueMount } from './use-vue-mount'

export const PasswordExample = () => {
  const containerRef = useVueMount(
    () => import('@embedpdf/example-vue-tailwind/password-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
