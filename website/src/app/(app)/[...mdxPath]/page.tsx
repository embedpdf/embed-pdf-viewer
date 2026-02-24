import { generateStaticParamsFor, importPage } from 'nextra/pages'
import { useMDXComponents as getMDXComponents } from '../../../../mdx-components'
import { Fragment } from 'react'
import { ComponentType } from 'react'

export const generateStaticParams = generateStaticParamsFor('mdxPath')

export async function generateMetadata(props: PageProps) {
  const params = await props.params

  const { metadata } = await importPage(params.mdxPath)
  return metadata
}

type PageProps = Readonly<{
  params: Promise<{
    mdxPath: string[]
    lang: string
  }>
}>

const Wrapper = getMDXComponents().wrapper ?? Fragment

export default async function Page(props: PageProps) {
  const params = await props.params

  const result = await importPage(params.mdxPath)
  const { default: MDXContent, ...rest } = result

  return (
    <Wrapper {...rest}>
      <MDXContent {...props} params={params} />
    </Wrapper>
  )
}
