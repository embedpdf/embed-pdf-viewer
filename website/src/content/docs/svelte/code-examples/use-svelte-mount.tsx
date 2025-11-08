'use client'
import { useEffect, useRef, useState } from 'react'

export function useSvelteMount(loader: () => Promise<{ default: any }>) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svelteAppRef = useRef<any>(null)
  const [isMounted, setIsMounted] = useState(false)

  // Ensure we only render on client
  useEffect(() => {
    setIsMounted(true)
  }, [])

  useEffect(() => {
    if (!isMounted) return

    let mounted = true

    const loadAndMount = async () => {
      if (!containerRef.current || svelteAppRef.current) return

      try {
        const mod = await loader()
        const { mount, unmount } = await import('svelte')

        if (!mounted) return

        // Svelte 5 uses mount() instead of new Component()
        const app = mount(mod.default, {
          target: containerRef.current,
        })
        svelteAppRef.current = { app, unmount }
      } catch (error) {
        console.error('Failed to mount Svelte component:', error)
      }
    }

    loadAndMount()

    return () => {
      mounted = false
      if (svelteAppRef.current) {
        // Svelte 5 uses unmount() instead of $destroy()
        svelteAppRef.current.unmount(svelteAppRef.current.app)
        svelteAppRef.current = null
      }
    }
  }, [loader, isMounted])

  return containerRef
}
