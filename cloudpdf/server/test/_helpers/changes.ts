/**
 * One change posted to a layer's `POST …/changes`, for tests that make a
 * write through the change route: the response, its body, and the change's
 * answer.
 */
import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';

/** Where a change goes, and the token it goes with. */
export interface ChangeTarget {
  baseUrl: string;
  docId: string;
  layerName: string;
  token: string;
}

/** A change's answer: applied with its result, or refused with its error. */
export interface ChangeAnswer {
  opId: string;
  status: 'applied' | 'refused';
  /** Its items in op order, and the change's meta with the commit's pins. */
  result?: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test items are probed loosely
    items: any[];
    meta: { cacheDelta: Record<string, unknown> | null } & Record<string, unknown>;
  };
  error?: { code: string; message: string };
}

export interface PostedChange {
  res: Response;
  body: { changes: ChangeAnswer[] } | null;
  /** The change's answer; undefined when the request was refused whole. */
  answer: ChangeAnswer | undefined;
}

/** Posts one change of `ops` under `opId` (a fresh one by default). */
export async function postChange(
  target: ChangeTarget,
  ops: readonly unknown[],
  opts: { opId?: string; headers?: Record<string, string> } = {},
): Promise<PostedChange> {
  const res = await fetch(
    `${target.baseUrl}/v1/docs/${target.docId}/layers/${target.layerName}/changes`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${target.token}`,
        'Content-Type': 'application/json',
        ...opts.headers,
      },
      body: JSON.stringify({ changes: [{ opId: opts.opId ?? randomUUID(), ops }] }),
    },
  );
  const body = (await res.json().catch(() => null)) as PostedChange['body'];
  return { res, body, answer: body?.changes?.[0] };
}

/** The result of a change that applied: the request answered 200 and the change `applied`. */
export function appliedResult(posted: PostedChange): NonNullable<ChangeAnswer['result']> {
  const why = JSON.stringify(posted.body);
  expect(posted.res.status, why).toBe(200);
  expect(posted.answer?.status, why).toBe('applied');
  return posted.answer!.result!;
}
