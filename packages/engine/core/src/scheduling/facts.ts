import type { PageBox } from '../geometry/pageSpace';
import type { PageRef } from '../identity/PageRef';

/**
 * How much a call matters, with `fetch`'s words. The caller says it, so the
 * engine knows no feature: a viewer gives `high` to what its views are for.
 * Most calls say nothing (`auto`).
 *
 * - `high`: the main thing a view shows of a page: its picture, in a viewer.
 * - `auto`: everything else about the document and what's shown (the default).
 * - `low`: background work, about nothing the views show (a search scan): it
 *   runs after everything else.
 *
 * Where a page is on screen counts before `high` and `auto` (see `rank`), so
 * a caller never says where its page is: the views say that.
 */
export type CallPriority = 'high' | 'auto' | 'low';

/**
 * What's true about a call for as long as it waits (`doc.with(facts)`). Both
 * are fixed once the call is made; when a result becomes urgent later, its
 * owner asks again.
 */
export interface CallFacts {
  /** Default `auto`. */
  readonly priority?: CallPriority;
  /**
   * The view the call serves, when its result is that view's own (a render
   * layer's pixels): the call then ranks by where its page is in that view.
   * Absent: the result is shared by every view (text, links, annotations),
   * and the call ranks by the best place its page has in any of them.
   */
  readonly view?: string;
}

/**
 * A page a view shows (`doc.setWorkingSet`). The engine ranks the calls for
 * the page by it, and keeps the pages it shows parsed longest.
 */
export interface WorkingSetPage {
  readonly page: PageRef;
  /** `visible`: some of it is on screen. `near`: placed just off screen, where the view goes next. */
  readonly role: 'visible' | 'near';
  /** The part on screen, in page space. Absent: the whole page, or none of a near page. */
  readonly visible?: PageBox;
  /** Device pixels of it on screen: what ranks visible pages among themselves. 0 for a near page. */
  readonly pixels: number;
}
