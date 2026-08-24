import type { MDXComponents } from 'mdx/types';
import { useMDXComponents as getDocsMDXComponents } from '@/components/docs/mdx';

const docsComponents = getDocsMDXComponents();

export function useMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...docsComponents,
    ...components,
  };
}
