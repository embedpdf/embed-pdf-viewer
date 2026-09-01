import { describe, expect, it } from 'vitest';

import { FormToken as ContractToken } from '../src/contract';
import { FormToken as HostToken } from '../src/host-contract';
import { FormToken as RootToken } from '../src/index';
import { FormToken as InternalToken } from '../src/internal';

describe('form contract entries', () => {
  it('re-export one runtime token through every type lens', () => {
    expect(ContractToken).toBe(RootToken);
    expect(HostToken).toBe(RootToken);
    expect(InternalToken).toBe(RootToken);
  });
});
