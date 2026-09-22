import { describe, expect, it } from 'vitest';

import { AnnotationToken as ContractToken } from '../src/contract';
import { AnnotationToken as HostToken } from '../src/host-contract';
import { AnnotationToken as RootToken } from '../src/index';

describe('annotation contract entries', () => {
  it('re-export one runtime token through every type lens', () => {
    expect(ContractToken).toBe(RootToken);
    expect(HostToken).toBe(RootToken);
  });
});
