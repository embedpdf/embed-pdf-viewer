import { exampleMetadata, exampleParams, ExampleRoute } from '@/components/site/example-route';

/** An example on a page of its own (`lib/examples.ts`). */
export const dynamicParams = false;

export function generateStaticParams() {
  return exampleParams();
}

type PageProps = Readonly<{ params: Promise<{ slug: string }> }>;

export async function generateMetadata(props: PageProps) {
  const { slug } = await props.params;
  return exampleMetadata(slug);
}

export default async function ExamplePage(props: PageProps) {
  const { slug } = await props.params;
  return <ExampleRoute slug={slug} />;
}
