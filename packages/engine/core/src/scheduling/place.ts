/**
 * Where a job is on screen, and how soon it runs: the pure half of the
 * engine's scheduling (the page residency plan, §10.4 and §10.5). The views
 * say what they show (`WorkingSetPage`); a job's place follows from its page,
 * the part of the page it's about, and the view it serves. Nothing here names
 * a request kind or a plugin.
 */
import type { CallPriority, WorkingSetPage } from './facts';
import type { PageBox } from '../geometry/pageSpace';
import type { PageRef } from '../identity/PageRef';

/** Where a job's page is: on screen, placed just off it, or in no view. */
export type Place = 'visible' | 'near' | 'elsewhere';

/** A job's place, and the device pixels of its page on screen there. */
export interface Placed {
  readonly place: Place;
  readonly pixels: number;
}

/** What a job is about, for its place: its page, the part of it, and the view it serves. */
export interface JobTarget {
  /** Absent: the job is about the whole document. */
  readonly page?: PageRef;
  /** The part of the page, in page space (a tile). Absent: the whole page. */
  readonly region?: PageBox;
  readonly view?: string;
}

/** One document's working sets: per view, the pages it shows by object number. */
export type ViewSets = ReadonlyMap<string, ReadonlyMap<number, WorkingSetPage>>;

const PLACE_ORDER: Record<Place, number> = { elsewhere: 0, near: 1, visible: 2 };

/** More device pixels than any screen shows, so pixels never outweigh the rest of a rank. */
const PIXEL_SPAN = 2 ** 40;

/** What {@link rank} needs to know about a job besides its place. */
export interface RankedJob {
  readonly priority: CallPriority;
  /** Present for a job about part of a page (a tile). */
  readonly region?: PageBox;
}

const ELSEWHERE: Placed = { place: 'elsewhere', pixels: 0 };
const ON_SCREEN: Placed = { place: 'visible', pixels: 0 };

/** Whether `a` is the better place: on screen before near before elsewhere, then more pixels. */
export function placedBefore(a: Placed, b: Placed): boolean {
  const order = PLACE_ORDER[a.place] - PLACE_ORDER[b.place];
  return order !== 0 ? order > 0 : a.pixels > b.pixels;
}

/**
 * A job's place in one view: its page's role there, except that a part of a
 * visible page that's off screen (a tile of the ring around what shows) is
 * `near`.
 */
export function placeIn(entry: WorkingSetPage | undefined, job: JobTarget): Placed {
  if (!entry) return ELSEWHERE;
  if (entry.role === 'near') return { place: 'near', pixels: 0 };
  if (job.region && entry.visible && !overlaps(job.region, entry.visible)) {
    return { place: 'near', pixels: 0 };
  }
  return { place: 'visible', pixels: entry.pixels };
}

/**
 * A job's place among a document's views: in the view it serves, or, when it
 * serves none (or one that said nothing), the best place its page has in any
 * view. A job about the whole document serves what's shown, so it counts as
 * on screen. While no view says anything, every job is on screen alike, and
 * jobs run in the order they were asked.
 */
export function placeFor(job: JobTarget, views: ViewSets): Placed {
  if (views.size === 0 || !job.page) return ON_SCREEN;
  const objectNumber = job.page.objectNumber;
  const served = job.view === undefined ? undefined : views.get(job.view);
  if (served) return placeIn(served.get(objectNumber), job);
  let best = ELSEWHERE;
  for (const pages of views.values()) {
    const placed = placeIn(pages.get(objectNumber), job);
    if (placedBefore(placed, best)) best = placed;
  }
  return best;
}

/**
 * How soon a job runs among those that may run: higher first. It compares, in
 * turn:
 * 1. background last: a `low` call is about nothing the views show;
 * 2. where its page is: on screen, then just off it, then elsewhere;
 * 3. its priority: `high` (the picture of the page itself) before `auto`;
 * 4. a whole page before a part of one: a tile is only of use once its page
 *    is there;
 * 5. the device pixels its page shows.
 * Equal ranks run in the order they were asked, so a caller sequences its own work.
 */
export function rank(job: RankedJob, placed: Placed): number {
  let level = job.priority === 'low' ? 0 : 1;
  level = level * 3 + PLACE_ORDER[placed.place];
  level = level * 2 + (job.priority === 'high' ? 1 : 0);
  level = level * 2 + (job.region ? 0 : 1);
  return level * PIXEL_SPAN + Math.min(PIXEL_SPAN - 1, Math.round(placed.pixels));
}

/**
 * Whether rank `a` beats rank `b` on more than pixels (any of the first four
 * steps of {@link rank}). A running job gives way only to a job that clearly
 * outranks it, so two pages on screen never stop each other's work, and jobs
 * don't flip back and forth while the camera moves.
 */
export function clearlyOutranks(a: number, b: number): boolean {
  return Math.floor(a / PIXEL_SPAN) > Math.floor(b / PIXEL_SPAN);
}

function overlaps(a: PageBox, b: PageBox): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}
