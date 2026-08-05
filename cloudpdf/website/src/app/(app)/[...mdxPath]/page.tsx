import { generateStaticParamsFor, importPage } from 'nextra/pages';
import { Fragment } from 'react';

import { useMDXComponents as getMDXComponents } from '../../../../mdx-components';

export const generateStaticParams = generateStaticParamsFor('mdxPath');

type PageProps = Readonly<{
  params: Promise<{ mdxPath: string[] }>;
}>;

export async function generateMetadata(props: PageProps) {
  const params = await props.params;
  const { metadata } = await importPage(params.mdxPath);
  return metadata;
}

const Wrapper = getMDXComponents().wrapper ?? Fragment;

export default async function Page(props: PageProps) {
  const params = await props.params;
  const result = await importPage(params.mdxPath);
  const { default: MDXContent, ...rest } = result;

  return (
    <Wrapper {...rest}>
      <MDXContent {...props} params={params} />
    </Wrapper>
  );
}
