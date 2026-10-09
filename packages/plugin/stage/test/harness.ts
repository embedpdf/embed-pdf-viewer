import { toPageRef } from '@embedpdf/core';
import { createTestContext } from '@embedpdf/core/testing';

import { createStageController } from '../src/controller';
import type { StageConfig, StageHostCapability } from '../src/host-contract';
import { initialStageState } from '../src/model';

/**
 * A placed stage over `count` portrait pages (object numbers 1…count), laid
 * out at 1:1 so sizes read in points, in a 1000 × 700 viewport.
 */
export function placedStage(count = 5, config: StageConfig = {}) {
  const ctx = createTestContext({
    id: 'stage',
    state: initialStageState({ viewUnitsPerPoint: 1, ...config }),
    pages: Array.from({ length: count }, (_, index) => ({
      ref: toPageRef(index + 1),
      size: { width: 600, height: 800 },
    })),
  });
  // Typed as the declared host lens: the composed slices' inferred signatures
  // make optional parameters (`options`) look required.
  const stage: StageHostCapability = ctx.connect(createStageController(ctx, config));
  stage.setViewportSize({ width: 1000, height: 700 });
  return { ctx, stage };
}
