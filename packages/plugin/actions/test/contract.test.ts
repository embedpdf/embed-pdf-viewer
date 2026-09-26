import { describe, expect, it } from 'vitest';

import { ActionsToken as ContractToken } from '../src/contract';
import { ActionsToken as HostToken } from '../src/host-contract';
import { ActionsToken as RootToken } from '../src/index';
import { ActionsToken as InternalToken } from '../src/internal';

describe('actions contract entries', () => {
  it('re-export one runtime token through every type lens', () => {
    expect(ContractToken).toBe(RootToken);
    expect(HostToken).toBe(RootToken);
    expect(InternalToken).toBe(RootToken);
  });
});
