import cn from 'clsx'
import { withIcons } from 'nextra/components'
import { useMDXComponents as getNextraMDXComponents } from 'nextra/mdx-components'
import type { MDXComponents } from 'nextra/mdx-components'
import { removeLinks } from 'nextra/remove-links'
import type { ComponentProps, FC, HTMLAttributes, ReactNode } from 'react'
import { Link } from './link'
import { H1, H2, H3, H4, H5, H6 } from './heading'
import { ClientWrapper } from './wrapper.client'
import { Sidebar } from '../sidebar'
import { Table } from './table'
import { Code } from './code'
import { Pre } from './pre'
import { PdfMergeTool } from '../tools/pdf-merge'
import ToolsOverview from '../tools-overview'
import { CodeExample } from '../code-example'
import { Heading, MDXWrapper } from 'nextra'

const Blockquote: FC<ComponentProps<'blockquote'>> = (props) => (
  <blockquote
    className={cn(
      'not-first:mt-6 border-gray-300 italic text-gray-700 dark:border-gray-700 dark:text-gray-300',
      'border-s-2 ps-6',
    )}
    {...props}
  />
)

type WrapperComponentProps = Parameters<MDXWrapper>[0] &
  HTMLAttributes<HTMLDivElement>

const WrapperComponent = ({
  toc,
  children,
  metadata,
  bottomContent,
  sourceCode,
  ...props
}: WrapperComponentProps): ReactNode => {
  // Fix the type issue by properly typing the toc transformation
  const processedToc: Heading[] = toc.map((item) => ({
    ...item,
    value: removeLinks(item.value) as string,
  }))

  return (
    <div className="mx-auto flex max-w-7xl px-4 sm:px-6 lg:px-8" {...props}>
      <Sidebar toc={processedToc} floatTOC={true} />

      <ClientWrapper
        toc={processedToc}
        metadata={metadata}
        bottomContent={bottomContent}
        sourceCode={sourceCode}
      >
        <main
          data-pagefind-body={
            (metadata as any).searchable !== false || undefined
          }
        >
          {children}
        </main>
      </ClientWrapper>
    </div>
  )
}

const DEFAULT_COMPONENTS = getNextraMDXComponents({
  a: (anchorProps) => <Link {...anchorProps} href={anchorProps.href || ''} />,
  code: Code,
  blockquote: Blockquote,
  h1: H1,
  h2: H2,
  h3: H3,
  h4: H4,
  h5: H5,
  h6: H6,
  hr: (props) => (
    <hr className="nextra-border my-8 dark:border-gray-800" {...props} />
  ),
  li: (props) => <li className="my-2" {...props} />,
  ol: (props) => (
    <ol
      className="not-first:mt-6 ms-6 list-decimal [is(ol,ul)_&]:my-3"
      {...props}
    />
  ),
  p: (props) => <p className="not-first:mt-6 leading-7" {...props} />,
  pre: withIcons(Pre),
  table: ({ className, ...props }) => (
    <Table
      className={cn('nextra-scrollbar not-first:mt-6 p-0', className)}
      {...props}
    />
  ),
  td: Table.Td,
  th: Table.Th,
  tr: Table.Tr,
  ul: (props) => (
    <ul
      className="not-first:mt-6 ms-6 list-disc [is(ol,ul)_&]:my-3"
      {...props}
    />
  ),
  wrapper: WrapperComponent,
  PdfMergeTool,
  ToolsOverview,
  CodeExample,
})

export const useMDXComponents = (components?: Readonly<MDXComponents>) => {
  return {
    ...DEFAULT_COMPONENTS,
    ...components,
  } satisfies MDXComponents
}
