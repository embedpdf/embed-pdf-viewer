'use client'
import { useEffect, useRef, useState } from 'react'

export function useAngularMount(
  loader: () => Promise<{ default: any; selector?: string }>,
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const angularAppRef = useRef<any>(null)
  const loaderRef = useRef(loader)
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    loaderRef.current = loader
  }, [loader])

  useEffect(() => {
    setIsMounted(true)
  }, [])

  useEffect(() => {
    if (!isMounted) return

    let mounted = true

    const loadAndMount = async () => {
      if (!containerRef.current || angularAppRef.current) return

      try {
        const [mod, _compiler, angularCore, platformBrowser] =
          await Promise.all([
            loaderRef.current(),
            import('@angular/compiler'),
            import('@angular/core'),
            import('@angular/platform-browser'),
          ])

        const selector = mod.selector ?? mod.default?.ɵcmp?.selectors?.[0]?.[0]
        if (!selector || typeof selector !== 'string') {
          throw new Error(
            'Angular demo component selector could not be resolved',
          )
        }

        const host = document.createElement(selector)
        containerRef.current.replaceChildren(host)

        const appRef = await platformBrowser.bootstrapApplication(mod.default, {
          providers: [angularCore.provideZonelessChangeDetection()],
        })

        if (!mounted) {
          appRef.destroy()
          return
        }

        angularAppRef.current = appRef
      } catch (error) {
        console.error('Failed to mount Angular component:', error)
      }
    }

    loadAndMount()

    return () => {
      mounted = false
      if (angularAppRef.current) {
        angularAppRef.current.destroy()
        angularAppRef.current = null
      }
      containerRef.current?.replaceChildren()
    }
  }, [isMounted])

  return { containerRef }
}
