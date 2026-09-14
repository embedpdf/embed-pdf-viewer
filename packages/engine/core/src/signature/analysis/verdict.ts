import type { Assessment, ChangeFinding, RevisionAnalysis, StepVerdict } from './types';

const RANK: Record<StepVerdict, number> = {
  unchanged: 0,
  permitted: 1,
  indeterminate: 2,
  forbidden: 3,
};

/** The worst of several verdicts (a certification replay's steps). */
export function worstVerdict(steps: ReadonlyArray<{ verdict: StepVerdict }>): StepVerdict {
  let worst: StepVerdict = 'unchanged';
  for (const s of steps) if (RANK[s.verdict] > RANK[worst]) worst = s.verdict;
  return worst;
}

/**
 * One aggregation rule everywhere: a proven violation decides, whatever
 * else could not be established; missing evidence never becomes a pass.
 */
export function conclude(
  findings: ReadonlyArray<ChangeFinding>,
  hasEffectiveChanges: boolean,
): StepVerdict {
  if (findings.some((f) => f.verdict === 'forbidden')) return 'forbidden';
  if (findings.some((f) => f.verdict === 'incomplete')) return 'indeterminate';
  return hasEffectiveChanges ? 'permitted' : 'unchanged';
}

/** The finding that explains a verdict: the violation, else the gap, else the most notable allowance. */
export function primaryFinding(
  findings: ReadonlyArray<ChangeFinding>,
): ChangeFinding | undefined {
  return (
    findings.find((f) => f.verdict === 'forbidden') ??
    findings.find((f) => f.verdict === 'incomplete') ??
    findings.find((f) => f.verdict === 'permitted')
  );
}

export function assessmentOf(step: RevisionAnalysis): Assessment {
  const primary = primaryFinding(step.findings);
  return {
    verdict: step.verdict,
    complete: !step.findings.some((f) => f.verdict === 'incomplete'),
    ...(primary ? { primary } : {}),
    findings: step.findings,
  };
}

/**
 * A certification window: the net verdict and every replayed step, under
 * the same rule. A step's violation is a violation of the certification
 * even when the final state no longer shows it (corpus v3/83).
 */
export function combine(net: RevisionAnalysis, steps: ReadonlyArray<RevisionAnalysis>): Assessment {
  const findings = [...net.findings];
  for (const s of steps) {
    if (s === net) continue;
    for (const f of s.findings) {
      if (f.verdict === 'permitted') continue;
      findings.push({ ...f, detail: `revision ${s.newer}: ${f.detail ?? f.rule}` });
    }
  }
  const verdict = conclude(findings, net.verdict !== 'unchanged' || steps.some((s) => s.verdict !== 'unchanged'));
  const primary = primaryFinding(findings);
  return {
    verdict,
    complete: !findings.some((f) => f.verdict === 'incomplete'),
    ...(primary ? { primary } : {}),
    findings,
  };
}
