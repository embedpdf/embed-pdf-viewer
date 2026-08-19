/**
 * Factory for the import-source family (see ADAPTERS.md). The wire
 * descriptor comes straight from the `documents.import` request body;
 * the policy comes from deployment config. Both are validated before
 * any network activity happens.
 */
import type { AdminImportSource } from '@cloudpdf/contract';

import { UrlImportSource } from './adapters/UrlImportSource';
import type { ImportPolicy } from './config/ImportPolicySchema';
import type { ImportSource } from './ImportSource';

export function createImportSource(config: AdminImportSource, policy: ImportPolicy): ImportSource {
  switch (config.kind) {
    case 'url':
      return new UrlImportSource({ url: config.url, policy });
  }
}
