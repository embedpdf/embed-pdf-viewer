import {
  getQuadBottomEdge,
  getQuadMidline,
  Quad,
  quadPolygonPoints,
  quadToRect,
  Rect,
  rectToQuad,
} from '@embedpdf/models';

export function resolveTextMarkupSegments(
  segmentRects: Rect[],
  segmentQuads?: Quad[],
): Quad[] {
  if (segmentQuads && segmentQuads.length > 0) return segmentQuads;
  return segmentRects.map(rectToQuad);
}

function mapQuadToLocalSpace(quad: Quad, container: Rect | undefined, scale: number) {
  const rect = quadToRect(quad);
  const offset = container?.origin ?? { x: 0, y: 0 };
  const baseX = (rect.origin.x - offset.x) * scale;
  const baseY = (rect.origin.y - offset.y) * scale;
  const mapPoint = (p: { x: number; y: number }) => ({
    x: (p.x - offset.x) * scale - baseX,
    y: (p.y - offset.y) * scale - baseY,
  });
  return {
    quad: {
      p1: mapPoint(quad.p1),
      p2: mapPoint(quad.p2),
      p3: mapPoint(quad.p3),
      p4: mapPoint(quad.p4),
    },
    bounds: {
      left: baseX,
      top: baseY,
      width: rect.size.width * scale,
      height: rect.size.height * scale,
    },
  };
}

export function quadBoundsRelativeToContainer(quad: Quad, container?: Rect, scale = 1) {
  const { bounds } = mapQuadToLocalSpace(quad, container, scale);
  return bounds;
}

export function scaleQuad(quad: Quad, scale: number, container?: Rect): Quad {
  return mapQuadToLocalSpace(quad, container, scale).quad;
}

export function quadClipPath(quad: Quad, container?: Rect, scale = 1): string {
  const { quad: localQuad } = mapQuadToLocalSpace(quad, container, scale);
  return `polygon(${quadPolygonPoints(localQuad)})`;
}

export function underlineSegmentPath(quad: Quad, container?: Rect, scale = 1): string {
  const { quad: localQuad } = mapQuadToLocalSpace(quad, container, scale);
  const { start, end } = getQuadBottomEdge(localQuad);
  return `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
}

export function strikeoutSegmentPath(quad: Quad, container?: Rect, scale = 1): string {
  const { quad: localQuad } = mapQuadToLocalSpace(quad, container, scale);
  const { start, end } = getQuadMidline(localQuad);
  return `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
}

export function squigglySegmentPath(
  quad: Quad,
  container?: Rect,
  scale = 1,
  amplitude = 2,
  wavelength = 6,
): string {
  const { quad: localQuad } = mapQuadToLocalSpace(quad, container, scale);
  const { start, end } = getQuadBottomEdge(localQuad);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length < 1) return `M ${start.x} ${start.y}`;

  const ux = dx / length;
  const uy = dy / length;
  const px = -uy;
  const py = ux;
  const steps = Math.max(2, Math.ceil(length / wavelength));
  const step = length / steps;

  let path = `M ${start.x} ${start.y}`;
  for (let i = 1; i <= steps; i++) {
    const t = i * step;
    const wave = i % 2 === 0 ? -amplitude : amplitude;
    const x = start.x + ux * t + px * wave;
    const y = start.y + uy * t + py * wave;
    path += ` L ${x} ${y}`;
  }
  return path;
}
