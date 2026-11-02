/**
 * The protected display module's routes on this document, through its channel: the viewing
 * session, licenses, FairPlay's certificate and the frames. Every refusal says what was refused
 * and why.
 */
import type { ModuleChannel } from '@cloudpdf/engine';
import { encodePageKey, type PageRef } from '@embedpdf/core';

import type { KeySystemName } from '../contract';

/** What `POST sessions` answers: one content key per viewer and document. */
export interface ViewingSession {
  readonly session: string;
  /** The content key's id, in hex. */
  readonly keyId: string;
  readonly expiresAt: string;
  /** Base64: the Widevine, PlayReady and common `pssh` boxes a cenc frame carries. */
  readonly initData: { readonly cenc: string };
  /** The systems the server issues licenses for, in its names. */
  readonly systems: readonly string[];
}

export interface ModuleRoutes {
  startSession(): Promise<ViewingSession>;
  license(session: string, keySystem: KeySystemName, request: ArrayBuffer): Promise<ArrayBuffer>;
  certificate(): Promise<ArrayBuffer>;
  /** A frame of `page`: `query` says which, at what size, in which codec and scheme. */
  frame(page: PageRef, query: Readonly<Record<string, string>>): Promise<ArrayBuffer>;
}

export function createModuleRoutes(channel: ModuleChannel, signal: AbortSignal): ModuleRoutes {
  return {
    async startSession() {
      const response = await channel.fetch('sessions', { method: 'POST', signal });
      if (!response.ok) {
        throw new Error(
          `the viewing session was refused (${response.status}): ${await response.text()}`,
        );
      }
      return (await response.json()) as ViewingSession;
    },

    async license(session, keySystem, request) {
      const query = new URLSearchParams({ session, system: keySystem });
      const response = await channel.fetch(`license?${query}`, {
        method: 'POST',
        headers: { 'content-type': 'application/octet-stream' },
        body: request,
        signal,
      });
      if (!response.ok) {
        const reason = response.headers.get('x-axdrm-errormessage') ?? (await response.text());
        throw new Error(`the ${keySystem} license was refused (${response.status}): ${reason}`);
      }
      return response.arrayBuffer();
    },

    async certificate() {
      const response = await channel.fetch('fairplay.cer', { signal });
      if (!response.ok) throw new Error(`no FairPlay certificate (${response.status})`);
      return response.arrayBuffer();
    },

    async frame(page, query) {
      const params = new URLSearchParams(query);
      const response = await channel.fetch(`frames/${encodePageKey(page)}?${params}`, { signal });
      if (!response.ok) {
        throw new Error(`a frame was refused (${response.status}): ${await response.text()}`);
      }
      return response.arrayBuffer();
    },
  };
}

export const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
