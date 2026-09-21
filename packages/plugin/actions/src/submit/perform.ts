/**
 * The submit pipeline (D7): one intent, one resolver, one sink chain —
 * embedder handler (explicit beats ambient; detached-promise contract) → the
 * document's home (`doc.forms.submit`, engine-asserted, awaited) → blocked.
 * Never a network call from this plugin.
 */
import type {
  ActionContext,
  ActionDiagnostic,
  ActionNodeStatus,
  ActionsConfig,
  ActionSubmitRequest,
  SubmitIntent,
} from '../contract';
import type { ActionsContext, ActionsServices } from '../services';
import { toFormSubmissionRequest } from './intent';

export function createSubmit(
  ctx: ActionsContext,
  services: Pick<ActionsServices, 'policy' | 'ports' | 'events'>,
  config: ActionsConfig,
) {
  const policy = services.policy;
  const ports = services.ports.slots;
  const { diagnosticHook } = services.events;
  const js = config.javascript;
  const nowMs = (): number => js?.now?.() ?? Date.now();

  /**
   * The ONE submit door — both sources land here after policy. Sink order:
   * embedder handler (explicit beats ambient; detached-promise contract) →
   * the document's home (`doc.forms.submit`, engine-asserted, AWAITED — a
   * real op with a real receipt) → blocked with `no-submit-sink`. Never a
   * network call from this plugin.
   */
  const performSubmit = async (
    intent: SubmitIntent,
    actionCtx: ActionContext,
    diagnose: (diagnostic: ActionDiagnostic) => void,
  ): Promise<{ status: ActionNodeStatus; detail?: string }> => {
    const decision = policy.current()['submit-form'][actionCtx.origin];
    if (decision !== 'adapter' && decision !== 'allow') {
      diagnose({
        code: 'blocked',
        message: `submit-form: policy '${decision}' for origin '${actionCtx.origin}'`,
      });
      return { status: 'blocked' };
    }
    if (!ports.submitResolver) {
      diagnose({
        code: 'no-submit-resolver',
        message: 'submit-form: no dataset resolver registered (form plugin missing?)',
      });
      return { status: 'blocked', detail: 'no dataset resolver' };
    }
    let request: ActionSubmitRequest;
    try {
      request = await ports.submitResolver(intent, actionCtx, diagnose);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      diagnose({ code: 'executor-failed', message: `submit-form: dataset resolution: ${detail}` });
      return { status: 'failed', detail };
    }
    const doc = ctx.doc;
    const homeSubmit =
      doc && typeof doc.forms.submit === 'function'
        ? () => Promise.resolve(doc.forms.submit!(toFormSubmissionRequest(request, nowMs())))
        : null;
    if (ports.submitHandler) {
      try {
        const outcome = ports.submitHandler(request, { submitToDocumentHome: homeSubmit });
        if (outcome && typeof (outcome as Promise<void>).then === 'function') {
          // DETACHED by contract: `executed` means "handed to the embedder";
          // a later rejection is observability, never a node-result rewrite.
          void (outcome as Promise<void>).catch((error: unknown) => {
            diagnosticHook.emit({
              code: 'executor-failed',
              message: `submit handler rejected (detached): ${
                error instanceof Error ? error.message : String(error)
              }`,
            });
          });
        }
        return { status: 'executed' };
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        diagnose({ code: 'executor-failed', message: `submit handler threw: ${detail}` });
        return { status: 'failed', detail };
      }
    }
    if (homeSubmit) {
      try {
        await homeSubmit();
        return { status: 'executed' };
      } catch (error) {
        // The engine's refusal (authority, transport) surfaced on the node —
        // enforcement lives at the home's boundary, we just report it.
        const detail = error instanceof Error ? error.message : String(error);
        diagnose({ code: 'executor-failed', message: `document home refused submit: ${detail}` });
        return { status: 'failed', detail };
      }
    }
    diagnose({
      code: 'no-submit-sink',
      message: 'submit-form: no handler installed and the document has no submit-capable home',
    });
    return { status: 'blocked', detail: 'no submit sink' };
  };

  return { performSubmit };
}
export type ActionsSubmit = ReturnType<typeof createSubmit>;
