import { describe, expect, it } from 'vitest';

import { ActionsToken as ContractToken } from './contract';
import { ActionsToken as HostToken } from './host-contract';
import { ActionsToken as RootToken } from './index';
import { ActionsToken as InternalToken } from './internal';

describe('actions contract entries', () => {
  it('re-export one runtime token through every type lens', () => {
    expect(ContractToken).toBe(RootToken);
    expect(HostToken).toBe(RootToken);
    expect(InternalToken).toBe(RootToken);
  });
});
