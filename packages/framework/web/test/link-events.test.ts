import { describe, expect, it, vi } from 'vitest';

import { hoverLink, linkActivateContextOf, sendLinkEvent } from '../src/link-events';

/**
 * What a link's anchor sends: the context it follows the link with, and the link's own PDF
 * events, which only a link that is an annotation has.
 */

const page = { kind: 'objectNumber', objectNumber: 4 } as const;
const ref = { kind: 'objectNumber', objectNumber: 12 } as const;
const hoverEvents = { enter: true, exit: false };
const annotationLink = { ref, activate: { root: null }, hoverEvents };
const documentLink = { activate: { root: null } };

describe('link events', () => {
  it('follows a link with its action tree, its annotation, its page and the view', () => {
    const stage = { name: 'stage' };
    expect(linkActivateContextOf(annotationLink, page, stage)).toEqual({
      activate: { root: null },
      ref,
      page,
      stage,
    });
    expect(linkActivateContextOf(documentLink, page, null)).toEqual({
      activate: { root: null },
      ref: undefined,
      page,
    });
  });

  it('sends an annotation link’s press, release and focus to the actions plugin', () => {
    const actions = { dispatch: vi.fn() };
    sendLinkEvent(actions, annotationLink, page, 'mouseDown');
    expect(actions.dispatch).toHaveBeenCalledWith({
      scope: 'annotation',
      event: 'mouseDown',
      ref,
      page,
      source: { kind: 'link', annotation: ref, page },
    });
  });

  it('sends nothing for a link that is no annotation, or without the actions plugin', () => {
    const actions = { dispatch: vi.fn() };
    sendLinkEvent(actions, documentLink, page, 'focus');
    sendLinkEvent(null, annotationLink, page, 'blur');
    expect(actions.dispatch).not.toHaveBeenCalled();
  });

  it('tells the hover pump about a link with hover trees only', () => {
    const pump = { hover: vi.fn() };
    hoverLink(pump, annotationLink, page);
    expect(pump.hover).toHaveBeenCalledWith({
      ref,
      page,
      source: { kind: 'link', annotation: ref, page },
      events: hoverEvents,
    });
    hoverLink(pump, { ref }, page);
    hoverLink(pump, documentLink, page);
    hoverLink(null, annotationLink, page);
    expect(pump.hover).toHaveBeenCalledTimes(1);
  });
});
