'use client'
import { useEffect, useRef, useState } from 'react'

export function useVueMount(loader: () => Promise<{ default: any }>) {
  const containerRef = useRef<HTMLDivElement>(null)
  const vueAppRef = useRef<any>(null)
  const [isMounted, setIsMounted] = useState(false)

  // Ensure we only render on client
  useEffect(() => {
    setIsMounted(true)
  }, [])

  useEffect(() => {
    if (!isMounted) return

    let mounted = true

    const loadAndMount = async () => {
      if (!containerRef.current || vueAppRef.current) return

      try {
        const mod = await loader()
        const { createApp } = await import('vue')

        if (!mounted) return

        const app = createApp(mod.default)
        app.mount(containerRef.current)
        vueAppRef.current = app
      } catch (error) {
        console.error('Failed to mount Vue component:', error)
      }
    }

    loadAndMount()

    return () => {
      mounted = false
      if (vueAppRef.current) {
        vueAppRef.current.unmount()
        vueAppRef.current = null
      }
    }
  }, [loader, isMounted])

  // ALWAYS return the ref, never return null
  return containerRef
}
