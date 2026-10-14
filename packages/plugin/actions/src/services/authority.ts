/** Session authority the action plane enforces itself (permission, not preference). */
import type { ActionsContext } from './context';

export function createAuthority(ctx: ActionsContext) {
  const allowsPrint = (): boolean => ctx.allows('doc.print');
  return { allowsPrint };
}
