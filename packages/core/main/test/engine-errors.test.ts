/**
 * What an engine error says as a plugin error: the file's own fault is invalid input, an engine
 * that couldn't do its part (an answer it doesn't understand, the network) failed.
 */
import { EngineError, EngineErrorCode } from '@embedpdf/engine-core/runtime';
import { describe, expect, it } from 'vitest';

import { toPluginError } from '../src/errors';

const codeOf = (code: EngineErrorCode) => toPluginError('probe', new EngineError(code, 'failed')).code;

describe('an engine error as a plugin error', () => {
  it("blames the input only when it's the input", () => {
    expect(codeOf(EngineErrorCode.MalformedPdf)).toBe('invalid-input');
    expect(codeOf(EngineErrorCode.InvalidArg)).toBe('invalid-input');
  });

  it("is a failed operation when the engine couldn't understand its worker or server", () => {
    expect(codeOf(EngineErrorCode.WireFormat)).toBe('operation-failed');
    expect(codeOf(EngineErrorCode.Network)).toBe('operation-failed');
  });
});
