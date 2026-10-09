import { describe, expect, it } from 'vitest';

import { SelectionToken as ContractToken } from '../src/contract';
import { SelectionToken as HostToken } from '../src/host-contract';
import { SelectionToken as RootToken } from '../src/index';

describe('selection contract entries', () => {
  it('re-export one runtime token through every type lens', () => {
    expect(ContractToken).toBe(RootToken);
    expect(HostToken).toBe(RootToken);
  });
});
