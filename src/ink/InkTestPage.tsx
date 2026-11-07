import { useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useSettings } from '../app/settings.ts';
import { PageShell } from '../app/PageShell.tsx';
import { PageDocument } from './document.ts';
import { InkEngine, type EngineStats } from './engine.ts';
import { pointsBbox } from './geometry.ts';
import { InkToolbar } from './InkToolbar.tsx';
import { selectToolConfig, useInkTools } from './toolStore.ts';
import { POINT_STRIDE, type StrokeObject } from './types.ts';
import { newId } from '../app/ids.ts';

/** Generates handwriting-like strokes for the benchmark. */
export function fakeStrokes(doc: PageDocument, count: number, sheets: number): StrokeObject[] {
  const out: StrokeObject[] = [];
  for (let i = 0; i < count; i++) {
    const n = 40;
    const pts = new Float32Array(n * POINT_STRIDE);
    const ox = 40 + (i * 37) % 720;
    const oy = 40 + (i * 11) % (1000 * sheets);
    const freq = 0.3 + (i % 7) * 0.08;
    for (let k = 0; k < n; k++) {
      pts.set([ox + k * 1.1, oy + Math.sin(k * freq) * 9, 0.4 + 0.3 * Math.sin(k * 0.2), k * 8], k * POINT_STRIDE);
    }
    out.push({ type: 'stroke', id: newId(), z: doc.allocZ(), brush: 'ballpoint', color: 'auto', width: 2.5, sim: false, pts, bbox: pointsBbox(pts, 6) });
  }
  return out;
}

/** A scratch canvas with live input readouts. Nothing here is saved. */
export function InkTestPage() {
  const host = useRef<HTMLDivElement>(null);
  const engineRef = useRef<InkEngine | null>(null);
  const [stats, setStats] = useState<EngineStats | null>(null);
  const [, setTick] = useState(0);
  const [result, setResult] = useState('');
  const fingerDraws = useSettings((s) => s.fingerDraws);
  const tool = useInkTools(useShallow(selectToolConfig));

  useEffect(() => {
    void useInkTools.getState().load();
    const doc = new PageDocument();
    const engine = new InkEngine(host.current!, doc, { template: 'college', paperColor: 'white', sheets: 1 }, {
      onStats: setStats,
      onHistory: () => setTick((t) => t + 1),
      fingerDraws,
    });
    engineRef.current = engine;
    (window as unknown as { __ink?: InkEngine }).__ink = engine;
    return () => engine.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { engineRef.current?.setTool(tool); }, [tool]);
  useEffect(() => { engineRef.current?.setFingerDraws(fingerDraws); }, [fingerDraws]);

  const benchmark = (count: number) => {
    const engine = engineRef.current!;
    const doc = engine.document;
    engine.addObjects(fakeStrokes(doc, count, 1));
    const first = engine.benchmarkFullRender();
    const again = engine.benchmarkFullRender();
    setResult(`${doc.size} strokes. First paint ${first.toFixed(1)} ms, repaint ${again.toFixed(1)} ms.`);
  };

  const engine = engineRef.current;
  return (
    <PageShell title="Ink test">
      <div className="ink-test">
        <InkToolbar canUndo={!!engine?.document.canUndo} canRedo={!!engine?.document.canRedo} onUndo={() => engine?.undo()} onRedo={() => engine?.redo()} />
        <div className="ink-test-canvas" ref={host} data-testid="ink-root" />
        <div className="ink-stats" data-testid="ink-stats">
          <span>Input: {stats?.pointerType || 'none yet'}</span>
          <span>Pressure: {stats?.pressure.toFixed(2) ?? '-'}</span>
          <span>Tilt: {stats ? `${stats.tiltX}, ${stats.tiltY}` : '-'}</span>
          <span>Coalesced: {stats?.coalesced ?? '-'}</span>
          <span>Predicted: {stats?.predicted ?? '-'}</span>
          <span>Live frame: {stats?.liveFrameMs.toFixed(2) ?? '-'} ms</span>
          <span>Cache paint: {stats?.cacheRenderMs.toFixed(1) ?? '-'} ms</span>
          <span>Low-latency canvas: {stats ? (stats.desynchronized ? 'yes' : 'no') : '-'}</span>
          <span>Objects: {stats?.strokes ?? 0}</span>
          <button type="button" className="btn btn-quiet" onClick={() => benchmark(5000)}>Add 5,000 strokes</button>
          <span data-testid="ink-bench">{result}</span>
        </div>
      </div>
    </PageShell>
  );
}
