import { describe, expect, it } from 'vitest';

import { SelectionToken as ContractToken } from './contract';
import { SelectionToken as HostToken } from './host-contract';
import { SelectionToken as RootToken } from './index';
import { SelectionToken as InternalToken } from './internal';

describe('selection contract entries', () => {
  it('re-export one runtime token through every type lens', () => {
    expect(ContractToken).toBe(RootToken);
    expect(HostToken).toBe(RootToken);
    expect(InternalToken).toBe(RootToken);
  });
});
