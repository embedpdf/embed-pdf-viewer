/**
 * Equality for the anchors plugins hand out. An anchor read (where a menu, a
 * badge or a selection handle attaches) returns a new object every time; a
 * framework adapter compares reads with these, so the UI attached to an
 * anchor renders again only when the anchor moved. The anchors are mirrored
 * structurally, so this package stays free of EmbedPDF imports.
 */

interface AnchorPoint {
  readonly x: number;
  readonly y: number;
}

interface AnchorBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface AnchorPage {
  readonly objectNumber: number;
}

const sameBox = (left: AnchorBox, right: AnchorBox): boolean =>
  left.x === right.x &&
  left.y === right.y &&
  left.width === right.width &&
  left.height === right.height;

/** A box on a page: a text selection's anchor, and the core of every other one. */
export interface PageBoundsAnchor {
  readonly page: AnchorPage;
  readonly bounds: AnchorBox;
}

/** The same page and box (a text selection's menu anchor). */
export function samePageBounds(
  left: PageBoundsAnchor | null,
  right: PageBoundsAnchor | null,
): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return left.page.objectNumber === right.page.objectNumber && sameBox(left.bounds, right.bounds);
}

/** The annotation selection's anchor: its page, its box, and its rotation handle when it has one. */
export interface SelectionAnchorShape extends PageBoundsAnchor {
  readonly rotationHandle?: AnchorPoint | null;
}

/** The same annotation selection anchor: page, box and rotation handle. */
export function sameSelectionAnchor(
  left: SelectionAnchorShape | null,
  right: SelectionAnchorShape | null,
): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return (
    samePageBounds(left, right) &&
    left.rotationHandle?.x === right.rotationHandle?.x &&
    left.rotationHandle?.y === right.rotationHandle?.y
  );
}

/** One annotation's anchor: page, box, and the view-dependent box of one that keeps its size on screen. */
export interface AnnotationAnchorShape extends PageBoundsAnchor {
  readonly boundsIn?: unknown;
}

/** The same annotation anchor: page, box, and how it follows the view. */
export function sameAnnotationAnchor(
  left: AnnotationAnchorShape | null,
  right: AnnotationAnchorShape | null,
): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return samePageBounds(left, right) && left.boundsIn === right.boundsIn;
}

/** A shape being drawn click by click (a polygon): where it is and how far it got. */
export interface CreationDraftAnchorShape extends PageBoundsAnchor {
  readonly kind: string;
  readonly subtype: string;
  readonly pointCount: number;
  readonly minPoints: number;
  readonly canFinish: boolean;
}

/** The same creation draft: what it draws, its points so far, whether it can finish, and its box. */
export function sameCreationDraftAnchor(
  left: CreationDraftAnchorShape | null,
  right: CreationDraftAnchorShape | null,
): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return (
    left.kind === right.kind &&
    left.subtype === right.subtype &&
    left.pointCount === right.pointCount &&
    left.minPoints === right.minPoints &&
    left.canFinish === right.canFinish &&
    samePageBounds(left, right)
  );
}

/** A turn in progress: the pointer's page point and the angle. */
export interface RotationAnchorShape {
  readonly page: AnchorPage;
  readonly at: AnchorPoint;
  readonly angle: number;
}

/** The same turn in progress: page, pointer and angle. */
export function sameRotationAnchor(
  left: RotationAnchorShape | null,
  right: RotationAnchorShape | null,
): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return (
    left.page.objectNumber === right.page.objectNumber &&
    left.at.x === right.at.x &&
    left.at.y === right.at.y &&
    left.angle === right.angle
  );
}

interface AnchorQuad {
  readonly upperLeft: AnchorPoint;
  readonly upperRight: AnchorPoint;
  readonly lowerLeft: AnchorPoint;
  readonly lowerRight: AnchorPoint;
}

const samePoint = (left: AnchorPoint, right: AnchorPoint): boolean =>
  left.x === right.x && left.y === right.y;

const sameQuad = (left: AnchorQuad, right: AnchorQuad): boolean =>
  samePoint(left.upperLeft, right.upperLeft) &&
  samePoint(left.upperRight, right.upperRight) &&
  samePoint(left.lowerLeft, right.lowerLeft) &&
  samePoint(left.lowerRight, right.lowerRight);

/** One end of a text selection: its page, the boundary glyph's quad, and the side of the glyph. */
export interface SelectionEndpointShape {
  readonly page: AnchorPage;
  readonly glyphQuad: AnchorQuad;
  readonly advance: unknown;
}

/** Both ends of a text selection, where its handles sit. */
export interface SelectionEndpointsShape {
  readonly start: SelectionEndpointShape;
  readonly end: SelectionEndpointShape;
}

/**
 * The same selection ends. The glyph quads compare corner by corner, so an
 * end that turns without moving its bounding box still counts as moved.
 */
export function sameSelectionEndpoints(
  left: SelectionEndpointsShape | null,
  right: SelectionEndpointsShape | null,
): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return (
    left.start.page.objectNumber === right.start.page.objectNumber &&
    left.end.page.objectNumber === right.end.page.objectNumber &&
    left.start.advance === right.start.advance &&
    left.end.advance === right.end.advance &&
    sameQuad(left.start.glyphQuad, right.start.glyphQuad) &&
    sameQuad(left.end.glyphQuad, right.end.glyphQuad)
  );
}
