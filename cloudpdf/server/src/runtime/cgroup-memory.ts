import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * This container's memory pressure (its cgroup — equals the pod's only
 * while the server is the pod's sole application container), read the
 * way kubelet computes the working set: usage minus reclaimable file
 * cache — reclaimable cache must never look like pressure or trigger an
 * engine recycle. The unified hierarchy (cgroup2) is read first, the
 * cgroup1 memory controller is the fallback; `null` when no cgroup
 * filesystem is readable (macOS dev, bare processes).
 *
 * The recycle policy this feeds: the cgroup triggers, while per-host RSS
 * attributes. Individual process RSS double-counts shared pages and is
 * never the primary pressure signal.
 */
export interface CgroupMemory {
  /** usage minus inactive file cache (kubelet's working-set formula). */
  workingSetBytes: number;
  /** cgroup limit; null = unlimited ("max" / cgroup1 sentinel). */
  limitBytes: number | null;
}

const V1_UNLIMITED = 0x7fff_ffff_ffff_f000; // common PAGE_COUNTER_MAX renderings

function readNum(path: string): number | null {
  try {
    const raw = readFileSync(path, 'utf8').trim();
    if (raw === 'max') return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function statValue(path: string, key: string): number {
  try {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const [k, v] = line.split(' ');
      if (k === key) return Number(v) || 0;
    }
  } catch {
    /* absent stat = 0 reclaimable */
  }
  return 0;
}

export function readCgroupMemory(root = '/sys/fs/cgroup'): CgroupMemory | null {
  // cgroup2 (unified): memory.current / memory.stat inactive_file / memory.max
  const current = readNum(join(root, 'memory.current'));
  if (current !== null) {
    const inactive = statValue(join(root, 'memory.stat'), 'inactive_file');
    const limit = readNum(join(root, 'memory.max'));
    return { workingSetBytes: Math.max(0, current - inactive), limitBytes: limit };
  }
  // cgroup1: memory/memory.usage_in_bytes / memory.stat total_inactive_file / limit
  const v1 = join(root, 'memory');
  const usage = readNum(join(v1, 'memory.usage_in_bytes'));
  if (usage !== null) {
    const inactive = statValue(join(v1, 'memory.stat'), 'total_inactive_file');
    const rawLimit = readNum(join(v1, 'memory.limit_in_bytes'));
    const limit = rawLimit !== null && rawLimit >= V1_UNLIMITED ? null : rawLimit;
    return { workingSetBytes: Math.max(0, usage - inactive), limitBytes: limit };
  }
  return null;
}
