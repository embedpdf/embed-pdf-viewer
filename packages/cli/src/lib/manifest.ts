import type { DocEntry } from '../index';
import manifestData from '../data/manifest.json';

export interface Manifest {
  docs: DocEntry[];
}

export function getManifest(): Manifest {
  return manifestData as Manifest;
}

export function findDoc(docPath: string): DocEntry | undefined {
  const manifest = getManifest();
  const normalized = docPath.replace(/^\/|\/$/g, '').replace(/\.mdx$/, '');
  return manifest.docs.find((d) => d.path === normalized);
}

export function listDocs(options?: { framework?: string; section?: string }): DocEntry[] {
  const manifest = getManifest();
  let docs = manifest.docs;

  if (options?.framework) {
    docs = docs.filter((d) => d.framework === options.framework);
  }
  if (options?.section) {
    docs = docs.filter((d) => d.section === options.section);
  }

  return docs;
}
