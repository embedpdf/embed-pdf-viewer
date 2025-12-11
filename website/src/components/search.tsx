'use client'

import {
  Combobox,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
} from '@headlessui/react'
import clsx from 'clsx'
import { addBasePath } from 'next/dist/client/add-base-path'
import NextLink from 'next/link'
import { useRouter } from 'next/navigation'
import type { FC, FocusEventHandler, ReactElement, SyntheticEvent } from 'react'
import { useDeferredValue, useEffect, useRef, useState } from 'react'
import { Search as SearchIcon, Loader2, AlertCircle, X } from 'lucide-react'
import type { PagefindResult, PagefindSearchOptions } from '@/types/pagefind'

async function importPagefind() {
  window.pagefind = await import(
    /* webpackIgnore: true */ addBasePath('/_pagefind/pagefind.js')
  )
  await window.pagefind!.options({
    baseUrl: '/',
  })
}

const DEV_SEARCH_NOTICE = (
  <>
    <p>
      Search isn&apos;t available in development because it uses Pagefind, which
      indexes built `.html` files.
    </p>
    <p className="mt-2">
      To test search, run `next build` then restart with `next dev`.
    </p>
  </>
)

interface SearchProps {
  className?: string
  emptyResult?: string
  errorText?: string
  loading?: string
  placeholder?: string
  searchOptions?: PagefindSearchOptions
}

export const Search: FC<SearchProps> = ({
  className,
  emptyResult = 'No results found.',
  errorText = 'Failed to load search index.',
  loading = 'Loading…',
  placeholder = 'Search documentation…',
  searchOptions,
}) => {
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<ReactElement | string>('')
  const [results, setResults] = useState<PagefindResult[]>([])
  const [search, setSearch] = useState('')
  const [focused, setFocused] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const deferredSearch = useDeferredValue(search)
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null!)
  const containerRef = useRef<HTMLDivElement>(null!)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Focus input when expanded
  useEffect(() => {
    if (expanded) {
      // Small delay to allow animation to start
      const timer = setTimeout(() => {
        inputRef.current?.focus({ preventScroll: true })
      }, 50)
      return () => clearTimeout(timer)
    }
  }, [expanded])

  // Close expanded search when clicking outside
  useEffect(() => {
    if (!expanded) return

    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setExpanded(false)
        setSearch('')
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [expanded])

  // Close on escape
  useEffect(() => {
    if (!expanded) return

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setExpanded(false)
        setSearch('')
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [expanded])

  useEffect(() => {
    const handleSearch = async (value: string) => {
      if (!value) {
        setResults([])
        setError('')
        return
      }

      setIsLoading(true)

      if (!window.pagefind) {
        try {
          await importPagefind()
        } catch (err) {
          const message =
            err instanceof Error
              ? process.env.NODE_ENV !== 'production' &&
                err.message.includes('Failed to fetch')
                ? DEV_SEARCH_NOTICE
                : `${err.constructor.name}: ${err.message}`
              : String(err)
          setError(message)
          setIsLoading(false)
          return
        }
      }

      const response = await window.pagefind!.debouncedSearch<PagefindResult>(
        value,
        searchOptions,
      )

      if (!response) return

      const data = await Promise.all(response.results.map((o) => o.data()))

      setIsLoading(false)
      setError('')
      setResults(
        data.map((newData) => ({
          ...newData,
          sub_results: newData.sub_results.map((r) => {
            const url = r.url.replace(/\.html$/, '').replace(/\.html#/, '#')
            return { ...r, url }
          }),
        })),
      )
    }

    handleSearch(deferredSearch)
  }, [deferredSearch, searchOptions])

  // Keyboard shortcut handler
  useEffect(() => {
    const INPUTS = new Set(['INPUT', 'SELECT', 'BUTTON', 'TEXTAREA'])

    function handleKeyDown(event: KeyboardEvent) {
      const el = document.activeElement

      if (
        !el ||
        INPUTS.has(el.tagName) ||
        (el as HTMLElement).isContentEditable
      ) {
        return
      }

      if (
        event.key === '/' ||
        (event.key === 'k' &&
          !event.shiftKey &&
          (navigator.userAgent.includes('Mac') ? event.metaKey : event.ctrlKey))
      ) {
        event.preventDefault()
        setExpanded(true)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handleFocus: FocusEventHandler = (event) => {
    setFocused(event.type === 'focus')
  }

  const handleChange = (event: SyntheticEvent<HTMLInputElement>) => {
    setSearch(event.currentTarget.value)
  }

  const handleSelect = (searchResult: PagefindResult | null) => {
    if (!searchResult) return

    inputRef.current?.blur()
    setExpanded(false)

    const [url, hash] = searchResult.url.split('#')
    const isSamePathname = location.pathname === url

    if (isSamePathname) {
      location.href = `#${hash}`
    } else {
      router.push(searchResult.url)
    }

    setSearch('')
  }

  const handleIconClick = () => {
    setExpanded(true)
  }

  const handleClose = () => {
    setExpanded(false)
    setSearch('')
  }

  const shortcut = (
    <kbd
      className={clsx(
        'pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 select-none items-center gap-1 rounded border border-gray-200 bg-white px-1.5 py-0.5 font-mono text-[10px] font-medium text-gray-500 transition-all dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400',
        'lg:flex',
        (!mounted || focused) && 'invisible opacity-0',
      )}
    >
      {mounted && navigator.userAgent.includes('Mac') ? (
        <>
          <span className="text-xs">⌘</span>K
        </>
      ) : (
        'CTRL K'
      )}
    </kbd>
  )

  return (
    <div ref={containerRef} className={clsx('relative', className)}>
      {/* Icon button - visible on smaller screens when not expanded */}
      <button
        onClick={handleIconClick}
        className={clsx(
          'flex h-9 w-9 items-center justify-center rounded-md border border-gray-200 bg-transparent transition-all hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800',
          'lg:hidden',
          expanded && 'hidden',
        )}
        aria-label="Open search"
      >
        <SearchIcon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
      </button>

      {/* Expanded search overlay - for smaller screens */}
      <div
        className={clsx(
          'lg:hidden',
          expanded
            ? 'fixed inset-x-0 top-0 z-50 flex h-16 items-center bg-white/95 px-4 shadow-lg backdrop-blur-lg dark:bg-gray-950/95'
            : 'hidden',
        )}
      >
        <Combobox onChange={handleSelect}>
          <div className="relative flex flex-1 items-center">
            <SearchIcon className="pointer-events-none absolute left-3 h-4 w-4 text-gray-400" />
            <ComboboxInput
              spellCheck={false}
              autoComplete="off"
              type="search"
              ref={inputRef}
              className={({ focus }) =>
                clsx(
                  'w-full rounded-lg py-2.5 pl-10 pr-4 text-base transition-all',
                  focus
                    ? 'bg-white ring-2 ring-blue-500 dark:bg-gray-900'
                    : 'bg-gray-100 dark:bg-gray-800',
                  'placeholder:text-gray-500 dark:placeholder:text-gray-400',
                  'border border-gray-200 dark:border-gray-700',
                  'text-gray-900 dark:text-gray-100',
                  '[&::-webkit-search-cancel-button]:appearance-none',
                )
              }
              onChange={handleChange}
              onFocus={handleFocus}
              onBlur={handleFocus}
              value={search}
              placeholder={placeholder}
            />
          </div>
          <button
            onClick={handleClose}
            className="ml-3 flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
            aria-label="Close search"
          >
            <X className="h-5 w-5" />
          </button>

          <ComboboxOptions
            transition
            anchor={{ to: 'bottom start', gap: 8, padding: 16 }}
            className={clsx(
              'z-50 max-h-[calc(100vh-6rem)] w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border border-gray-200 bg-white/95 py-2 shadow-xl backdrop-blur-lg dark:border-gray-700 dark:bg-gray-900/95',
              'origin-top transition duration-200 ease-out data-[closed]:scale-95 data-[closed]:opacity-0',
              (error || isLoading || !results.length) &&
                'flex min-h-24 items-center justify-center gap-2 px-4 text-sm',
              error && 'text-red-500',
              !error && (isLoading || !results.length) && 'text-gray-500',
            )}
          >
            {error ? (
              <>
                <AlertCircle className="h-5 w-5 shrink-0" />
                <div className="grid text-left">
                  <b className="mb-1">{errorText}</b>
                  {error}
                </div>
              </>
            ) : isLoading && deferredSearch ? (
              <>
                <Loader2 className="h-5 w-5 shrink-0 animate-spin" />
                {loading}
              </>
            ) : results.length ? (
              results.map((searchResult) => (
                <Result key={searchResult.url} data={searchResult} />
              ))
            ) : (
              deferredSearch && emptyResult
            )}
          </ComboboxOptions>
        </Combobox>
      </div>

      {/* Desktop search - always visible on large screens */}
      <div className="hidden lg:block">
        <Combobox onChange={handleSelect}>
          <div className="relative flex items-center text-gray-900 dark:text-gray-300">
            <SearchIcon className="pointer-events-none absolute left-3 h-4 w-4 text-gray-400" />
            <ComboboxInput
              spellCheck={false}
              autoComplete="off"
              type="search"
              className={({ focus }) =>
                clsx(
                  'w-72 rounded-lg py-2 pl-9 pr-16 text-sm transition-all',
                  focus
                    ? 'bg-white ring-2 ring-blue-500 dark:bg-gray-900'
                    : 'bg-gray-100 dark:bg-gray-800',
                  'placeholder:text-gray-500 dark:placeholder:text-gray-400',
                  'border border-gray-200 dark:border-gray-700',
                  '[&::-webkit-search-cancel-button]:appearance-none',
                )
              }
              onChange={handleChange}
              onFocus={handleFocus}
              onBlur={handleFocus}
              value={search}
              placeholder={placeholder}
            />
            {shortcut}
          </div>

          <ComboboxOptions
            transition
            anchor={{ to: 'bottom start', gap: 8, padding: 16 }}
            className={clsx(
              'z-50 max-h-[min(calc(100vh-10rem),400px)] w-[500px] overflow-y-auto rounded-xl border border-gray-200 bg-white/95 py-2 shadow-xl backdrop-blur-lg dark:border-gray-700 dark:bg-gray-900/95',
              'origin-top transition duration-200 ease-out data-[closed]:scale-95 data-[closed]:opacity-0',
              (error || isLoading || !results.length) &&
                'flex min-h-24 items-center justify-center gap-2 px-4 text-sm',
              error && 'text-red-500',
              !error && (isLoading || !results.length) && 'text-gray-500',
            )}
          >
            {error ? (
              <>
                <AlertCircle className="h-5 w-5 shrink-0" />
                <div className="grid text-left">
                  <b className="mb-1">{errorText}</b>
                  {error}
                </div>
              </>
            ) : isLoading && deferredSearch ? (
              <>
                <Loader2 className="h-5 w-5 shrink-0 animate-spin" />
                {loading}
              </>
            ) : results.length ? (
              results.map((searchResult) => (
                <Result key={searchResult.url} data={searchResult} />
              ))
            ) : (
              deferredSearch && emptyResult
            )}
          </ComboboxOptions>
        </Combobox>
      </div>
    </div>
  )
}

const Result: FC<{ data: PagefindResult }> = ({ data }) => {
  return (
    <>
      <div className="mx-2.5 mb-2 mt-4 select-none border-b border-gray-200 px-2.5 pb-1.5 text-xs font-semibold uppercase text-gray-500 first:mt-0 dark:border-gray-700 dark:text-gray-400">
        {data.meta.title}
      </div>
      {data.sub_results.map((subResult) => (
        <ComboboxOption
          key={subResult.url}
          as={NextLink}
          value={subResult}
          href={subResult.url}
          className={({ focus }) =>
            clsx(
              'mx-2.5 block scroll-m-12 break-words rounded-lg px-3 py-2',
              focus
                ? 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400'
                : 'text-gray-700 dark:text-gray-300',
            )
          }
        >
          <div className="text-sm font-semibold leading-5">
            {subResult.title}
          </div>
          <div
            className="mt-1 text-xs leading-relaxed text-gray-600 dark:text-gray-400 [&_mark]:rounded [&_mark]:bg-yellow-200 [&_mark]:px-0.5 [&_mark]:text-gray-900 dark:[&_mark]:bg-yellow-500/30 dark:[&_mark]:text-yellow-200"
            dangerouslySetInnerHTML={{ __html: subResult.excerpt }}
          />
        </ComboboxOption>
      ))}
    </>
  )
}

export default Search
