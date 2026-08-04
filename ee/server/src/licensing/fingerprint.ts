import { createHash } from 'node:crypto';

export function deploymentFingerprint(deploymentId: string): string {
  return createHash('sha256')
    .update(`cloudpdf/self-hosted/deployment/v1:${deploymentId}`)
    .digest('hex');
}
