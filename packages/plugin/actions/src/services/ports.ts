/**
 * The registration slots: every port a sibling or the embedder installs. One
 * owner: the slots live here; areas read them at call time (never captured),
 * and every disposer is identity-safe (it clears a slot only while the
 * registrant is still current). Executors are last-wins. No capability read
 * exposes a slot, so installing one wakes no reader.
 */
import type { Unsubscribe } from '@embedpdf/core';
import type { PdfActionType } from '@embedpdf/engine-core/runtime';

import type { ActionExecutor, ActionSubmitHandler, ActionUiAdapter } from '../contract';
import type {
  ActionsHostCapability,
  AnnotCommitSink,
  FormCommitSink,
  SubmitResolver,
} from '../host-contract';
import type { ActionsEvents } from './events';

export interface ActionPorts {
  readonly executors: Map<PdfActionType, ActionExecutor>;
  annotCommitSink: AnnotCommitSink | null;
  formCommitSink: FormCommitSink | null;
  uiAdapter: ActionUiAdapter | null;
  /** Sink 1 of the submit chain (consent = installation). */
  submitHandler: ActionSubmitHandler | null;
  /** The form plugin's dataset resolver: the one door every submit resolves through. */
  submitResolver: SubmitResolver | null;
}

export function createPorts({ diagnosticHook }: Pick<ActionsEvents, 'diagnosticHook'>) {
  const ports: ActionPorts = {
    executors: new Map(),
    annotCommitSink: null,
    formCommitSink: null,
    uiAdapter: null,
    submitHandler: null,
    submitResolver: null,
  };
  const api = {
    registerExecutor: (type, executor): Unsubscribe => {
      if (ports.executors.has(type)) {
        diagnosticHook.emit({
          code: 'duplicate-executor',
          message: `executor for '${type}' replaced (last-wins)`,
        });
      }
      ports.executors.set(type, executor);
      return () => {
        if (ports.executors.get(type) === executor) ports.executors.delete(type);
      };
    },
    registerAnnotCommitSink: (sink): Unsubscribe => {
      ports.annotCommitSink = sink;
      return () => {
        if (ports.annotCommitSink === sink) ports.annotCommitSink = null;
      };
    },
    registerFormCommitSink: (sink): Unsubscribe => {
      ports.formCommitSink = sink;
      return () => {
        if (ports.formCommitSink === sink) ports.formCommitSink = null;
      };
    },
    setSubmitHandler: (handler): Unsubscribe => {
      ports.submitHandler = handler;
      // Not an open-sequence release: that stays the UI adapter's role.
      return () => {
        if (ports.submitHandler === handler) ports.submitHandler = null;
      };
    },
    registerSubmitResolver: (resolver): Unsubscribe => {
      ports.submitResolver = resolver;
      return () => {
        if (ports.submitResolver === resolver) ports.submitResolver = null;
      };
    },
  } satisfies Partial<ActionsHostCapability>;
  return { slots: ports, api };
}
