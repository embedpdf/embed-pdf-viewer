import { h } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';

interface GroupStats {
  durations: number[];
  count: number;
  last: number;
  avg: number;
  min: number;
  max: number;
}

interface PerfState {
  groups: Map<string, GroupStats>;
  renderMode: string;
}

const MAX_ROLLING = 500;

function parseEntryName(name: string) {
  // Pattern: Source.Category.Event.Phase.Identifier
  const parts = name.split('.');
  if (parts.length < 4) return null;
  return {
    source: parts[0],
    category: parts[1],
    event: parts[2],
    phase: parts[3],
  };
}

export function PerfOverlay() {
  const [state, setState] = useState<PerfState>({
    groups: new Map(),
    renderMode: 'blob',
  });

  const groupsRef = useRef(new Map<string, GroupStats>());
  const updateTimerRef = useRef(0);

  useEffect(() => {
    const measureObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const parsed = parseEntryName(entry.name);
        if (!parsed || parsed.phase !== 'Measure') continue;

        const key = `${parsed.source}.${parsed.category}.${parsed.event}`;
        const groups = groupsRef.current;

        let group = groups.get(key);
        if (!group) {
          group = { durations: [], count: 0, last: 0, avg: 0, min: Infinity, max: 0 };
          groups.set(key, group);
        }

        const dur = entry.duration;
        group.durations.push(dur);
        if (group.durations.length > MAX_ROLLING) {
          group.durations.shift();
        }
        group.count++;
        group.last = dur;
        group.min = Math.min(group.min, dur);
        group.max = Math.max(group.max, dur);
        group.avg = group.durations.reduce((a, b) => a + b, 0) / group.durations.length;

        if (parsed.source === 'RenderLayer') {
          setState((prev) => ({ ...prev, renderMode: parsed.category }));
        }
      }

      scheduleUpdate();
    });

    try {
      measureObserver.observe({ type: 'measure', buffered: false });
    } catch {
      measureObserver.observe({ entryTypes: ['measure'] });
    }

    function scheduleUpdate() {
      if (updateTimerRef.current) return;
      updateTimerRef.current = window.setTimeout(() => {
        updateTimerRef.current = 0;
        setState((prev) => ({
          ...prev,
          groups: new Map(groupsRef.current),
        }));
      }, 200);
    }

    return () => {
      measureObserver.disconnect();
      if (updateTimerRef.current) clearTimeout(updateTimerRef.current);
    };
  }, []);

  const sortedGroups = [...state.groups.entries()].sort(([a], [b]) => {
    const order = ['RenderLayer', 'TileImg', 'RenderPlugin', 'ThumbImg'];
    const aIdx = order.findIndex((s) => a.startsWith(s));
    const bIdx = order.findIndex((s) => b.startsWith(s));
    const aPri = aIdx === -1 ? order.length : aIdx;
    const bPri = bIdx === -1 ? order.length : bIdx;
    return aPri - bPri;
  });

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '8px',
        right: '8px',
        zIndex: 9999,
        background: 'rgba(0, 0, 0, 0.85)',
        color: '#e0e0e0',
        fontFamily: 'monospace',
        fontSize: '11px',
        lineHeight: '1.4',
        padding: '8px 10px',
        borderRadius: '6px',
        pointerEvents: 'none',
        minWidth: '380px',
        maxWidth: '500px',
        backdropFilter: 'blur(4px)',
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: '4px', color: '#888' }}>
        mode: <span style={{ color: '#90caf9' }}>{state.renderMode}</span>
      </div>

      {/* Divider */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.15)', margin: '4px 0' }} />

      {/* Stats table */}
      {sortedGroups.length === 0 ? (
        <div style={{ color: '#666', textAlign: 'center', padding: '4px 0' }}>
          waiting for perf data...
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ color: '#888', fontSize: '10px' }}>
              <th style={{ textAlign: 'left', paddingRight: '6px', fontWeight: 'normal' }}>
                source
              </th>
              <th style={{ textAlign: 'right', paddingRight: '6px', fontWeight: 'normal' }}>
                last
              </th>
              <th style={{ textAlign: 'right', paddingRight: '6px', fontWeight: 'normal' }}>
                avg ({MAX_ROLLING})
              </th>
              <th style={{ textAlign: 'right', paddingRight: '6px', fontWeight: 'normal' }}>min</th>
              <th style={{ textAlign: 'right', paddingRight: '6px', fontWeight: 'normal' }}>max</th>
              <th style={{ textAlign: 'right', fontWeight: 'normal' }}>#</th>
            </tr>
          </thead>
          <tbody>
            {sortedGroups.map(([key, stats]) => (
              <tr key={key}>
                <td
                  style={{
                    textAlign: 'left',
                    paddingRight: '6px',
                    color: '#b0bec5',
                    maxWidth: '520px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={key}
                >
                  {key}
                </td>
                <td style={{ textAlign: 'right', paddingRight: '6px', color: '#fff' }}>
                  {stats.last.toFixed(1)}
                </td>
                <td style={{ textAlign: 'right', paddingRight: '6px', color: '#90caf9' }}>
                  {stats.avg.toFixed(1)}
                </td>
                <td style={{ textAlign: 'right', paddingRight: '6px', color: '#4caf50' }}>
                  {stats.min === Infinity ? '-' : stats.min.toFixed(1)}
                </td>
                <td style={{ textAlign: 'right', paddingRight: '6px', color: '#f44336' }}>
                  {stats.max.toFixed(1)}
                </td>
                <td style={{ textAlign: 'right', color: '#888' }}>{stats.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
