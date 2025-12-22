'use client'
import { useVueMount } from '../use-vue-mount'

export const PasswordExample = () => {
  const containerRef = useVueMount(
    () => import('@embedpdf/example-vue-tailwind/headless/password-example'),
  )

  return <div ref={containerRef} suppressHydrationWarning />
}
