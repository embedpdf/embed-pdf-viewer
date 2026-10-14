import { useStageState } from '@embedpdf/react/stage';
import { BottomSheet, SidePanel } from './panels';

export function Panels() {
  const compact = useStageState((state) => state.activeRules.includes('compact'));

  return compact ? <BottomSheet /> : <SidePanel />;
}
