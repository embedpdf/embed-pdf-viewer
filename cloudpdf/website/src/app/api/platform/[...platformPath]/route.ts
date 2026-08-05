import type { NextRequest } from 'next/server';

import { proxyPlatformRequest } from '@/lib/platform-proxy';

interface PlatformRouteContext {
  params: Promise<{ platformPath: string[] }>;
}

async function handle(request: NextRequest, context: PlatformRouteContext) {
  const { platformPath } = await context.params;
  return proxyPlatformRequest(request, platformPath);
}

export const GET = handle;
export const POST = handle;
