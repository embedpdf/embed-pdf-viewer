/**
 * The submit pipeline: one intent, one resolver, one sink chain. Both submit
 * sources (a SubmitForm node, a script `doc.submitForm()`) land in
 * `performSubmit` after policy. Never a network call from this plugin.
 */
import type { PluginContext } from '@embedpdf/core';

import type {
  ActionContext,
  ActionDiagnostic,
  ActionNodeStatus,
  ActionsConfig,
  ActionSubmitRequest,
  SubmitIntent,
} from '../contract';
import type { ActionsServices } from '../services';
import { toFormSubmissionRequest } from './intent';

export function createSubmit(
  ctx: PluginContext<void>,
  services: Pick<ActionsServices, 'policy' | 'ports' | 'events'>,
  config: ActionsConfig,
) {
  const policy = services.policy;
  const ports = services.ports.slots;
  const { diagnosticHook } = services.events;
  const nowMs = (): number => config.javascript?.now?.() ?? Date.now();

  /**
   * The one submit door. Sink order: the embedder handler (explicit beats
   * ambient; its promise is not awaited) → the document's home
   * (`doc.forms.submit`, engine-asserted and awaited: a real operation with a
   * real receipt) → blocked with `no-submit-sink`.
   */
  const performSubmit = async (
    intent: SubmitIntent,
    actionContext: ActionContext,
    diagnose: (diagnostic: ActionDiagnostic) => void,
  ): Promise<{ status: ActionNodeStatus; detail?: string }> => {
    const decision = policy.current()['submit-form'][actionContext.origin];
    if (decision !== 'adapter' && decision !== 'allow') {
      diagnose({
        code: 'blocked',
        message: `submit-form: policy '${decision}' for origin '${actionContext.origin}'`,
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
      request = await ports.submitResolver(intent, actionContext, diagnose);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      diagnose({ code: 'executor-failed', message: `submit-form: dataset resolution: ${detail}` });
      return { status: 'failed', detail };
    }
    const forms = ctx.doc.forms;
    const homeSubmit =
      typeof forms.submit === 'function'
        ? () => Promise.resolve(forms.submit!(toFormSubmissionRequest(request, nowMs())))
        : null;
    if (ports.submitHandler) {
      try {
        const outcome = ports.submitHandler(request, { submitToDocumentHome: homeSubmit });
        if (outcome && typeof (outcome as Promise<void>).then === 'function') {
          // Not awaited, by contract: `executed` means "handed to the
          // embedder"; a later rejection is a diagnostic, never a rewrite of
          // the node result.
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
        // The engine's refusal (authority, transport) surfaces on the node:
        // enforcement lives at the home's boundary, this only reports it.
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
