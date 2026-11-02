import type { PluginContext } from '@embedpdf/core';

import type { ProtectedDisplaySettings, ProtectedDisplayStatus } from '../contract';

export type ProtectedDisplayContext = PluginContext<
  ProtectedDisplayStatus,
  ProtectedDisplaySettings
>;
