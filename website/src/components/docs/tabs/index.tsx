'use no memo';

import type { ComponentProps } from 'react';

import { Tabs as _Tabs, Tab } from './index.client';

// Workaround for "Cannot access Tab.propTypes on the server. You cannot dot
// into a client module from a server component." — re-export through a plain
// server wrapper so MDX can access `Tabs.Tab`.
export const Tabs = Object.assign((props: ComponentProps<typeof _Tabs>) => <_Tabs {...props} />, {
  Tab,
});

export { useInTabs } from './index.client';
