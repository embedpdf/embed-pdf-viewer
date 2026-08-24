/**
 * @license FCL-1.0-ALv2
 *
 * WARNING: This file is part of CloudPDF's license-key functionality. Removing
 * or modifying this code to disable or circumvent license enforcement, enable
 * protected functionality without a valid license key, or remove protected
 * functionality is a breach of FCL-1.0-ALv2 while this release is governed by
 * that license. See cloudpdf/server/LICENSE.
 */
import { createHash } from 'node:crypto';

export function deploymentFingerprint(deploymentId: string): string {
  return createHash('sha256')
    .update(`cloudpdf/self-hosted/deployment/v1:${deploymentId}`)
    .digest('hex');
}
