import { connectProtectedDisplay } from './connect';
import type { ProtectedDisplayCapability } from './contract';
import type { ProtectedDisplayContext } from './services/context';

export function createProtectedDisplayController(ctx: ProtectedDisplayContext) {
  const api = {
    ...ctx.settings().api,
    getStatus: () => ctx.state.get(),
  } satisfies ProtectedDisplayCapability;

  return {
    api,
    connect: () => connectProtectedDisplay(ctx),
  };
}
