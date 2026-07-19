import { describe, expect, test } from 'vitest';
import type { DocumentEvent } from '@embedpdf/engine-core/runtime';
import { EventHub, SessionEventPublisher } from '@embedpdf/engine-services';

function metadataEvent(serverId: number | null = null): DocumentEvent {
  return {
    type: 'metadata.updated',
    metadata: {
      title: 't',
      author: null,
      subject: null,
      keywords: null,
      producer: null,
      creator: null,
      created: null,
      modified: null,
      trapped: 'unknown',
      custom: {},
    },
    cache: null,
    origin: { kind: 'local', sessionId: 's', sub: null, ts: 1, serverId },
  };
}

describe('EventHub: delivery contract', () => {
  test('a throwing listener never blocks other listeners (error isolation)', () => {
    const errors: unknown[] = [];
    const hub = new EventHub((err) => errors.push(err));
    const seen: string[] = [];
    hub.subscribe(() => {
      throw new Error('listener one is broken');
    });
    hub.subscribe((event) => seen.push(event.type));

    hub.publish(metadataEvent());

    expect(seen).toEqual(['metadata.updated']);
    expect(errors).toHaveLength(1);
    expect((errors[0] as Error).message).toBe('listener one is broken');
  });

  test('lastServerId tracks the highest remote cursor seen', () => {
    const hub = new EventHub(() => {});
    expect(hub.lastServerId()).toBeNull();
    hub.publish(metadataEvent(7));
    hub.publish(metadataEvent(3)); // out-of-order delivery never regresses it
    expect(hub.lastServerId()).toBe(7);
    hub.publish(metadataEvent(null)); // local events don't move it
    expect(hub.lastServerId()).toBe(7);
  });

  test('publisher stamps a local origin with the session identity', () => {
    const hub = new EventHub(() => {});
    const publisher = new SessionEventPublisher(hub, 'session-x', 'alice');
    const events: DocumentEvent[] = [];
    hub.subscribe((event) => events.push(event));

    const { origin: _origin, ...init } = metadataEvent();
    publisher.publishLocal(init);

    expect(events).toHaveLength(1);
    expect(events[0].origin).toMatchObject({
      kind: 'local',
      sessionId: 'session-x',
      sub: 'alice',
      serverId: null,
    });
  });
});
