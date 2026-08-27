import type { FastifyReply, FastifyRequest } from 'fastify';
import { describe, expect, test, vi } from 'vitest';

import { handleAppError } from '../src/app/buildApp';

function requestDouble(error: ReturnType<typeof vi.fn>): FastifyRequest {
  return { log: { error } } as unknown as FastifyRequest;
}

function replyDouble(): {
  reply: FastifyReply;
  code: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
} {
  const code = vi.fn();
  const send = vi.fn();
  const header = vi.fn();
  const value = { code, send, header };
  code.mockReturnValue(value);
  header.mockReturnValue(value);
  send.mockReturnValue(value);
  return { reply: value as unknown as FastifyReply, code, send };
}

describe('application error logging', () => {
  test('logs a handled 502 with structured status and error context', () => {
    const logError = vi.fn();
    const { reply, code, send } = replyDouble();
    const err = Object.assign(new Error('transfer failed: Access Denied'), {
      code: 'UpstreamError',
      status: 502,
    });

    handleAppError(err, requestDouble(logError), reply);

    expect(logError).toHaveBeenCalledOnce();
    expect(logError).toHaveBeenCalledWith({ err, statusCode: 502 }, 'request failed');
    expect(code).toHaveBeenCalledWith(502);
    expect(send).toHaveBeenCalledWith({
      error: { code: 'UpstreamError', message: 'transfer failed: Access Denied' },
    });
  });

  test('does not error-log an expected handled 4xx', () => {
    const logError = vi.fn();
    const { reply, code } = replyDouble();
    const err = Object.assign(new Error('invalid import request'), {
      code: 'InvalidArg',
      status: 400,
    });

    handleAppError(err, requestDouble(logError), reply);

    expect(logError).not.toHaveBeenCalled();
    expect(code).toHaveBeenCalledWith(400);
  });
});
