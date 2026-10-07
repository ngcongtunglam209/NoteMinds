import { useCallback, useMemo, useState, useEffect, useRef, memo } from 'react';
import ReactFlow, {
  Controls,
  MiniMap,
  Background,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  Handle,
  Position,
  MarkerType,
  getRectOfNodes,
  getTransformForBounds,
  getBezierPath,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { toPng } from 'html-to-image';
import {
  Loader2, AlertCircle, Map, RefreshCw, Image as ImageIcon,
  Lock, Maximize2, Minimize2, ZoomIn, ZoomOut, Crosshair,
  GitBranch, Circle, ChevronRight, Network,
} from 'lucide-react';
import { useLanguage } from '../LanguageContext';

/* ─── colour palette ─── */
const BRANCH_PALETTE = [
  { bg: '#ef444420', fg: '#ef4444', glow: '#ef444440', accent: '#fca5a5' },
  { bg: '#8b5cf620', fg: '#8b5cf6', glow: '#8b5cf640', accent: '#c4b5fd' },
  { bg: '#06b6d420', fg: '#06b6d4', glow: '#06b6d440', accent: '#67e8f9' },
  { bg: '#f59e0b20', fg: '#f59e0b', glow: '#f59e0b40', accent: '#fcd34d' },
  { bg: '#10b98120', fg: '#10b981', glow: '#10b98140', accent: '#6ee7b7' },
  { bg: '#ec489920', fg: '#ec4899', glow: '#ec489940', accent: '#f9a8d4' },
  { bg: '#3b82f620', fg: '#3b82f6', glow: '#3b82f640', accent: '#93c5fd' },
  { bg: '#f9731620', fg: '#f97316', glow: '#f9731640', accent: '#fdba74' },
];

/* ─── Custom Node Components ─── */
const RootNode = memo(({ data }) => (
  <div className="mindmap-node-root group" title={data.label}>
    <Handle type="source" position={Position.Right} className="!opacity-0 !w-2 !h-2" />
    <Handle type="source" position={Position.Left} className="!opacity-0 !w-2 !h-2" id="left" />
    <Handle type="source" position={Position.Top} className="!opacity-0 !w-2 !h-2" id="top" />
    <Handle type="source" position={Position.Bottom} className="!opacity-0 !w-2 !h-2" id="bottom" />
    <div className="absolute -inset-1 rounded-2xl bg-gradient-to-br from-primary-500/30 to-primary-600/10 blur-lg opacity-60 group-hover:opacity-90 transition-opacity duration-500" />
    <div className="relative flex items-center gap-3 bg-gradient-to-br from-primary-600 to-primary-500 text-white rounded-2xl px-6 py-4 shadow-lg shadow-primary-600/25 border border-primary-400/20">
      <Network size={20} className="shrink-0 opacity-80" />
      <span className="font-bold text-[15px] leading-snug">{data.label}</span>
    </div>
  </div>
));
RootNode.displayName = 'RootNode';

const BranchNode = memo(({ data }) => {
  const c = data._color || BRANCH_PALETTE[0];
  return (
    <div className="mindmap-node-branch group" title={data.label}>
      <Handle type="target" position={Position.Left} className="!opacity-0 !w-2 !h-2" />
      <Handle type="target" position={Position.Right} className="!opacity-0 !w-2 !h-2" id="right-in" />
      <Handle type="source" position={Position.Right} className="!opacity-0 !w-2 !h-2" id="right" />
      <Handle type="source" position={Position.Left} className="!opacity-0 !w-2 !h-2" id="left" />
      <div
        className="relative flex items-center gap-2.5 rounded-xl px-4 py-2.5 border-2 transition-all duration-300 group-hover:scale-[1.03] group-hover:shadow-lg cursor-pointer"
        style={{
          background: c.bg,
          borderColor: c.fg + '50',
          boxShadow: `0 0 0 0 ${c.glow}`,
          color: c.fg,
        }}
      >
        <div className="w-2 h-2 rounded-full shrink-0" style={{ background: c.fg }} />
        <span className="font-semibold text-[13px] leading-snug max-w-[180px]">{data.label}</span>
        {data._childCount > 0 && (
          <span className="ml-auto text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center" style={{ background: c.fg + '20' }}>
            {data._collapsed ? '+' : data._childCount}
          </span>
        )}
      </div>
    </div>
  );
});
BranchNode.displayName = 'BranchNode';

const SubNode = memo(({ data }) => {
  const c = data._color || BRANCH_PALETTE[0];
  return (
    <div className="mindmap-node-sub group" title={data.label}>
      <Handle type="target" position={Position.Left} className="!opacity-0 !w-2 !h-2" />
      <Handle type="target" position={Position.Right} className="!opacity-0 !w-2 !h-2" id="right-in" />
      <Handle type="source" position={Position.Right} className="!opacity-0 !w-2 !h-2" id="right" />
      <Handle type="source" position={Position.Left} className="!opacity-0 !w-2 !h-2" id="left" />
      <div
        className="flex items-center gap-2 rounded-lg px-3 py-2 border transition-all duration-300 group-hover:scale-[1.02] bg-surface-2 border-line cursor-pointer"
        style={{ borderLeftColor: c.fg, borderLeftWidth: 3 }}
      >
        <ChevronRight size={12} className={`shrink-0 text-muted transition-transform duration-200 ${data._collapsed ? '' : data._childCount > 0 ? 'rotate-90' : ''}`} style={{ opacity: data._childCount > 0 ? 0.7 : 0.3 }} />
        <span className="text-[12px] text-txt font-medium leading-snug max-w-[170px]">{data.label}</span>
        {data._childCount > 0 && data._collapsed && (
          <span className="text-[9px] font-bold rounded px-1 py-0.5 opacity-50" style={{ background: c.fg + '15', color: c.fg }}>+{data._childCount}</span>
        )}
      </div>
    </div>
  );
});
SubNode.displayName = 'SubNode';

const LeafNode = memo(({ data }) => {
  const c = data._color || BRANCH_PALETTE[0];
  return (
    <div className="mindmap-node-leaf group" title={data.label}>
      <Handle type="target" position={Position.Left} className="!opacity-0 !w-2 !h-2" />
      <Handle type="target" position={Position.Right} className="!opacity-0 !w-2 !h-2" id="right-in" />
      <div
        className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 transition-all duration-300 group-hover:scale-[1.02] bg-surface border border-line/50"
      >
        <Circle size={6} className="shrink-0 opacity-40" style={{ color: c.fg }} />
        <span className="text-[11px] text-muted leading-snug max-w-[160px]">{data.label}</span>
      </div>
    </div>
  );
});
LeafNode.displayName = 'LeafNode';

const nodeTypes = { rootNode: RootNode, branchNode: BranchNode, subNode: SubNode, leafNode: LeafNode };

/* ─── Adaptive spacing based on total visible node count ─── */
function getLayoutConfig(totalNodes) {
  // Scale factor: 1.0 for small maps, gently shrinks for large ones
  const s = totalNodes <= 20 ? 1 : totalNodes <= 40 ? 0.9 : totalNodes <= 70 ? 0.8 : totalNodes <= 120 ? 0.7 : 0.6;
  return {
    nodeH: { 0: 56, 1: Math.round(48 * s), 2: Math.round(44 * s), 3: Math.round(38 * s) },
    vGap: { 1: Math.round(28 * s), 2: Math.round(22 * s), 3: Math.round(16 * s) },
    hGap: { 1: Math.round(360 * Math.max(s, 0.7)), 2: Math.round(280 * Math.max(s, 0.65)), 3: Math.round(240 * Math.max(s, 0.6)) },
  };
}

/* Count all visible nodes (respecting collapsed set) */
function countVisible(node, level, collapsed) {
  let n = 1;
  if (node.children?.length && !collapsed.has(node.id)) {
    node.children.forEach(ch => { n += countVisible(ch, level + 1, collapsed); });
  }
  return n;
}

/**
 * Calculate the total vertical space a subtree needs (recursive, bottom-up).
 */
function measureHeight(node, level, collapsed, cfg) {
  const selfH = cfg.nodeH[level] || 30;
  if (!node.children?.length || collapsed.has(node.id)) return selfH;

  const childLevel = level + 1;
  const gap = cfg.vGap[childLevel] || 10;
  let total = 0;
  node.children.forEach((ch, i) => {
    if (i > 0) total += gap;
    total += measureHeight(ch, childLevel, collapsed, cfg);
  });
  return Math.max(selfH, total);
}

function convertToReactFlow(data, collapsed) {
  if (!data?.nodes?.[0]) return { nodes: [], edges: [] };

  const rfNodes = [];
  const rfEdges = [];
  const root = data.nodes[0];
  const collapsedSet = collapsed || new Set();

  // Count visible nodes to determine adaptive scaling
  let visibleCount = 1;
  if (root.children?.length) {
    root.children.forEach(ch => { visibleCount += countVisible(ch, 1, collapsedSet); });
  }
  const cfg = getLayoutConfig(visibleCount);

  rfNodes.push({
    id: root.id,
    type: 'rootNode',
    data: { label: root.label },
    position: { x: 0, y: 0 },
  });

  if (!root.children?.length) return { nodes: rfNodes, edges: rfEdges };

  // Split children into left (even indices) and right (odd indices)
  const leftBranches = root.children.filter((_, i) => i % 2 === 0);
  const rightBranches = root.children.filter((_, i) => i % 2 !== 0);

  const layoutSide = (branches, isLeft) => {
    const sideGap = cfg.vGap[1];
    const heights = branches.map(b => measureHeight(b, 1, collapsedSet, cfg));
    const totalH = heights.reduce((s, h) => s + h, 0) + Math.max(0, heights.length - 1) * sideGap;

    let cursorY = -totalH / 2;

    branches.forEach((branch, idx) => {
      const origIdx = isLeft ? idx * 2 : idx * 2 + 1;
      const color = BRANCH_PALETTE[origIdx % BRANCH_PALETTE.length];
      const branchH = heights[idx];
      const branchCenterY = cursorY + branchH / 2;
      const xDir = isLeft ? -1 : 1;
      const branchX = xDir * cfg.hGap[1];
      const isCollapsed = collapsedSet.has(branch.id);

      rfNodes.push({
        id: branch.id,
        type: 'branchNode',
        data: {
          label: branch.label,
          _color: color,
          _childCount: branch.children?.length || 0,
          _collapsed: isCollapsed,
        },
        position: { x: branchX, y: branchCenterY },
      });

      rfEdges.push({
        id: `e-${root.id}-${branch.id}`,
        source: root.id,
        target: branch.id,
        sourceHandle: isLeft ? 'left' : undefined,
        targetHandle: isLeft ? 'right-in' : undefined,
        type: 'smoothstep',
        animated: false,
        style: { stroke: color.fg, strokeWidth: 2.5, opacity: 0.7 },
        markerEnd: { type: MarkerType.ArrowClosed, color: color.fg, width: 16, height: 16 },
      });

      // Layout level 2 children
      if (branch.children?.length && !isCollapsed) {
        const subHeights = branch.children.map(s => measureHeight(s, 2, collapsedSet, cfg));
        const subGap = cfg.vGap[2];
        const subTotalH = subHeights.reduce((s, h) => s + h, 0) + Math.max(0, subHeights.length - 1) * subGap;
        let subCursorY = branchCenterY - subTotalH / 2;

        branch.children.forEach((sub, j) => {
          const subH = subHeights[j];
          const subCenterY = subCursorY + subH / 2;
          const subX = branchX + xDir * cfg.hGap[2];
          const isSubCollapsed = collapsedSet.has(sub.id);

          rfNodes.push({
            id: sub.id,
            type: 'subNode',
            data: {
              label: sub.label,
              _color: color,
              _childCount: sub.children?.length || 0,
              _collapsed: isSubCollapsed,
            },
            position: { x: subX, y: subCenterY },
          });

          rfEdges.push({
            id: `e-${branch.id}-${sub.id}`,
            source: branch.id,
            target: sub.id,
            sourceHandle: isLeft ? 'left' : 'right',
            targetHandle: isLeft ? 'right-in' : undefined,
            type: 'smoothstep',
            style: { stroke: color.fg, strokeWidth: 1.5, opacity: 0.5 },
          });

          // Layout level 3 children
          if (sub.children?.length && !isSubCollapsed) {
            const leafGap = cfg.vGap[3];
            const leafH = cfg.nodeH[3];
            const leafTotalH = sub.children.length * leafH + Math.max(0, sub.children.length - 1) * leafGap;
            let leafCursorY = subCenterY - leafTotalH / 2;

            sub.children.forEach((leaf) => {
              const leafCenterY = leafCursorY + leafH / 2;
              const leafX = subX + xDir * cfg.hGap[3];

              rfNodes.push({
                id: leaf.id,
                type: 'leafNode',
                data: { label: leaf.label, _color: color },
                position: { x: leafX, y: leafCenterY },
              });

              rfEdges.push({
                id: `e-${sub.id}-${leaf.id}`,
                source: sub.id,
                target: leaf.id,
                sourceHandle: isLeft ? 'left' : 'right',
                targetHandle: isLeft ? 'right-in' : undefined,
                type: 'smoothstep',
                style: { stroke: color.fg, strokeWidth: 1, opacity: 0.35 },
              });

              leafCursorY += leafH + leafGap;
            });
          }

          subCursorY += subH + subGap;
        });
      }

      cursorY += branchH + sideGap;
    });
  };

  layoutSide(leftBranches, true);
  layoutSide(rightBranches, false);

  return { nodes: rfNodes, edges: rfEdges };
}

/* ─── Stats helper ─── */
function countNodes(data) {
  if (!data?.nodes?.[0]) return 0;
  let count = 0;
  const walk = (n) => { count++; n.children?.forEach(walk); };
  walk(data.nodes[0]);
  return count;
}

/* ─── Main Export ─── */
export default function MindmapView({ data, loading, error, onGenerate, isLocked }) {
  return (
    <ReactFlowProvider>
      <MindmapViewInner data={data} loading={loading} error={error} onGenerate={onGenerate} isLocked={isLocked} />
    </ReactFlowProvider>
  );
}

function MindmapViewInner({ data, loading, error, onGenerate, isLocked }) {
  const { t } = useLanguage();
  const reactFlowInstance = useReactFlow();
  const { getNodes, fitView, zoomIn, zoomOut } = reactFlowInstance;
  const containerRef = useRef(null);
  const [exporting, setExporting] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [collapsed, setCollapsed] = useState(new Set());

  const rebuildGraph = useCallback((d, c) => {
    if (!d) return { nodes: [], edges: [] };
    return convertToReactFlow(d, c);
  }, []);

  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => rebuildGraph(data, collapsed),
    [data, collapsed, rebuildGraph]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => {
    if (data) {
      const { nodes: n, edges: e } = rebuildGraph(data, collapsed);
      setNodes(n);
      setEdges(e);
      // Re-fit after layout change
      setTimeout(() => fitView({ padding: 0.2, duration: 300 }), 50);
    }
  }, [data, collapsed, rebuildGraph]);

  /* ── Toggle collapse on node click ── */
  const onNodeClick = useCallback((_event, node) => {
    if (node.type === 'branchNode' || node.type === 'subNode') {
      const hasChildren = node.data._childCount > 0;
      if (!hasChildren) return;
      setCollapsed(prev => {
        const next = new Set(prev);
        if (next.has(node.id)) next.delete(node.id);
        else next.add(node.id);
        return next;
      });
    }
  }, []);

  /* ── Collapse / Expand all ── */
  const collapseAll = useCallback(() => {
    if (!data?.nodes?.[0]) return;
    const ids = new Set();
    const walk = (n) => { if (n.children?.length) { ids.add(n.id); n.children.forEach(walk); } };
    data.nodes[0].children?.forEach(walk);
    // Also add the branches themselves
    data.nodes[0].children?.forEach(b => { if (b.children?.length) ids.add(b.id); });
    setCollapsed(ids);
  }, [data]);

  const expandAll = useCallback(() => {
    setCollapsed(new Set());
  }, []);

  const nodeCount = useMemo(() => countNodes(data), [data]);

  /* ── Auto-collapse deep levels for very large mindmaps on first load ── */
  const hasAutoCollapsed = useRef(false);
  useEffect(() => {
    if (!data || hasAutoCollapsed.current) return;
    hasAutoCollapsed.current = true;
    const total = countNodes(data);
    if (total > 40) {
      // Auto-collapse level 2+ nodes (sub-branches) so the initial view is clean
      const ids = new Set();
      const root = data.nodes[0];
      root.children?.forEach(branch => {
        if (total > 80) {
          // Very large: collapse branches too
          if (branch.children?.length) ids.add(branch.id);
        }
        branch.children?.forEach(sub => {
          if (sub.children?.length) ids.add(sub.id);
        });
      });
      if (ids.size > 0) setCollapsed(ids);
    }
  }, [data]);

  const [loadingText, setLoadingText] = useState(t('mindmap.loadingStep1'));

  /* ── Fullscreen toggle ── */
  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen?.().then(() => setIsFullscreen(true)).catch(() => { });
    } else {
      document.exitFullscreen?.().then(() => setIsFullscreen(false)).catch(() => { });
    }
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  /* ── Keyboard shortcuts ── */
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'f' && (e.metaKey || e.ctrlKey) && e.shiftKey) {
        e.preventDefault();
        toggleFullscreen();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggleFullscreen]);

  /* ── Export PNG ── */
  const handleExportPng = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const nodesBounds = getRectOfNodes(getNodes());
      const padding = 60;
      const imageWidth = nodesBounds.width + padding * 2;
      const imageHeight = nodesBounds.height + padding * 2;
      const transform = getTransformForBounds(nodesBounds, imageWidth, imageHeight, 0.5, 2, padding);
      const viewport = document.querySelector('.react-flow__viewport');
      if (!viewport) throw new Error(t('mindmap.viewportNotFound'));

      const bgColor = getComputedStyle(document.documentElement).getPropertyValue('--color-surface').trim() || '#1a1b2e';

      const dataUrl = await toPng(viewport, {
        backgroundColor: bgColor,
        width: imageWidth,
        height: imageHeight,
        style: {
          width: `${imageWidth}px`,
          height: `${imageHeight}px`,
          transform: `translate(${transform[0]}px, ${transform[1]}px) scale(${transform[2]})`,
        },
        pixelRatio: 2,
      });

      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `mindmap-${data?.title?.slice(0, 30)?.replace(/[^a-zA-Z0-9_-]/g, '_') || 'export'}.png`;
      a.click();
    } catch (err) {
      console.error('Export mindmap failed:', err);
      alert(`${t('mindmap.exportImageError')}: ${err.message || t('common.retry')}`);
    } finally {
      setExporting(false);
    }
  };

  /* ── Loading text cycle ── */
  useEffect(() => {
    if (!loading) return;
    const texts = [
      t('mindmap.loadingStep1'),
      t('mindmap.loadingStep2'),
      t('mindmap.loadingStep3'),
      t('mindmap.loadingStep4')
    ];
    let i = 0;
    const interval = setInterval(() => { i = (i + 1) % texts.length; setLoadingText(texts[i]); }, 2500);
    return () => clearInterval(interval);
  }, [loading, t]);

  /* ── Loading state ── */
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[500px] h-full gap-6 relative overflow-hidden bg-surface">
        {/* Animated radial skeleton */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <svg className="w-[500px] h-[400px] opacity-20" viewBox="0 0 500 400">
            {/* Root pulse */}
            <rect x="200" y="175" width="100" height="50" rx="14" className="fill-line animate-pulse" />
            {/* Branches */}
            {[
              { x1: 200, y1: 200, x2: 80, y2: 100, w: 70, h: 30 },
              { x1: 300, y1: 200, x2: 370, y2: 100, w: 70, h: 30 },
              { x1: 200, y1: 200, x2: 60, y2: 260, w: 70, h: 30 },
              { x1: 300, y1: 200, x2: 390, y2: 260, w: 70, h: 30 },
              { x1: 200, y1: 200, x2: 40, y2: 180, w: 65, h: 26 },
              { x1: 300, y1: 200, x2: 410, y2: 180, w: 65, h: 26 },
            ].map((b, i) => (
              <g key={i}>
                <path
                  d={`M${b.x1},${b.y1} Q${(b.x1 + b.x2) / 2},${b.y1} ${b.x2 + b.w / 2},${b.y2 + b.h / 2}`}
                  fill="none" stroke="var(--color-border)" strokeWidth="1.5" strokeDasharray="4 4"
                  className="animate-pulse" style={{ animationDelay: `${i * 200}ms` }}
                />
                <rect
                  x={b.x2} y={b.y2} width={b.w} height={b.h} rx="8"
                  className="fill-surface-2 animate-pulse" style={{ animationDelay: `${i * 150}ms` }}
                />
              </g>
            ))}
          </svg>
        </div>

        {/* Foreground card */}
        <div className="relative z-20 flex flex-col items-center bg-surface/90 backdrop-blur-xl px-10 py-8 rounded-3xl border border-line shadow-2xl">
          <div className="relative">
            <div className="absolute -inset-4 bg-primary-500/10 rounded-full blur-2xl animate-pulse" />
            <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center shadow-lg shadow-primary-600/20">
              <Network size={28} className="text-white animate-pulse" />
            </div>
          </div>
          <p className="mt-5 font-semibold text-sm bg-clip-text text-transparent bg-gradient-to-r from-primary-400 to-primary-600 transition-all duration-500 text-center min-h-[24px] flex items-center justify-center">
            {loadingText}
          </p>
          <div className="w-56 bg-line/50 h-1.5 rounded-full mt-4 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-primary-500 to-primary-400 rounded-full animate-[slide_2.5s_ease-in-out_infinite_alternate]" style={{ width: '40%' }} />
          </div>
          <p className="text-[11px] text-muted mt-3">{t('mindmap.generating')}</p>
        </div>
      </div>
    );
  }

  /* ── Error state ── */
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[500px] gap-5">
        <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
          <AlertCircle size={30} className="text-red-400" />
        </div>
        <div className="text-center">
          <p className="text-red-400 font-semibold mb-1">{t('mindmap.errorGenerating')}</p>
          <p className="text-sm text-muted max-w-md">{error}</p>
        </div>
        <button
          onClick={onGenerate}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary-600 rounded-xl text-sm font-medium hover:bg-primary-700 transition-all shadow-lg shadow-primary-600/20"
        >
          <RefreshCw size={14} /> {t('common.retry')}
        </button>
      </div>
    );
  }

  /* ── Empty state ── */
  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-[500px] gap-5 animate-fade-in">
        <div className="relative group">
          <div className={`absolute -inset-2 rounded-2xl blur-lg opacity-40 transition-opacity duration-500 ${isLocked ? 'bg-gray-500/15' : 'bg-primary-500/15 group-hover:opacity-70'}`} />
          <div className={`relative w-16 h-16 rounded-2xl shadow-lg border flex items-center justify-center ${isLocked
              ? 'bg-gradient-to-br from-gray-600 to-gray-500 shadow-gray-600/25 border-gray-400/20'
              : 'bg-gradient-to-br from-primary-600 to-primary-500 shadow-primary-600/25 border-primary-400/20'
            }`}>
            {isLocked ? <Lock size={28} className="text-white" /> : <Network size={28} className="text-white" />}
          </div>
        </div>
        <div className="text-center">
          <p className="font-bold text-lg text-txt mb-1">{isLocked ? t('mindmap.sourceDeletedTitle') : t('mindmap.emptyTitle')}</p>
          <p className="text-sm text-muted">{isLocked ? t('mindmap.sourceDeletedDesc') : t('mindmap.emptyDesc')}</p>
        </div>
        <button
          onClick={onGenerate}
          disabled={isLocked}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-xl transition-all font-semibold text-white text-sm active:scale-95 ${isLocked
              ? 'bg-gray-600 cursor-not-allowed opacity-50'
              : 'bg-gradient-to-r from-primary-600 to-primary-500 hover:shadow-lg hover:shadow-primary-600/20'
            }`}
        >
          <RefreshCw size={14} /> {t('mindmap.generateButton')}
        </button>
      </div>
    );
  }

  if (!Array.isArray(data?.nodes) || data.nodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[500px] gap-5 animate-fade-in">
        <div className="relative group">
          <div className="absolute -inset-2 rounded-2xl bg-primary-500/15 blur-lg opacity-50" />
          <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-600 to-primary-500 shadow-lg shadow-primary-600/25 border border-primary-400/20 flex items-center justify-center">
            <Network size={28} className="text-white" />
          </div>
        </div>
        <div className="text-center">
          <p className="font-bold text-lg text-txt mb-1">{t('mindmap.emptyTitle')}</p>
          <p className="text-sm text-muted">{t('mindmap.emptyDesc')}</p>
        </div>
        <button
          onClick={onGenerate}
          disabled={isLocked}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-xl transition-all font-semibold text-white text-sm active:scale-95 ${isLocked
            ? 'bg-gray-600 cursor-not-allowed opacity-50'
            : 'bg-gradient-to-r from-primary-600 to-primary-500 hover:shadow-lg hover:shadow-primary-600/20'
            }`}
        >
          <RefreshCw size={14} /> {t('mindmap.generateButton')}
        </button>
      </div>
    );
  }

  /* ── Main mindmap view ── */
  return (
    <div ref={containerRef} className={`w-full flex flex-col ${isFullscreen ? 'h-screen bg-surface' : 'h-[650px]'}`}>
      {/* Toolbar */}
      <div className="px-4 py-2.5 border-b border-line flex items-center justify-between bg-surface-2/40 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <GitBranch size={14} className="text-primary-400" />
            <h3 className="font-bold text-sm text-txt truncate max-w-[200px] sm:max-w-[300px]">{data.title || t('mindmap.defaultTitle')}</h3>
          </div>
          <span className="text-[10px] text-muted font-medium bg-surface-2 px-2 py-0.5 rounded-md border border-line hidden sm:inline-flex items-center gap-1">
            <Circle size={6} className="text-primary-400 fill-primary-400" />
            {t('mindmap.nodesCount', { count: nodeCount })}
          </span>
          {/* Collapse / Expand */}
          {data?.nodes?.[0]?.children?.length > 0 && (
            <div className="hidden sm:flex items-center gap-1">
              <button onClick={collapseAll} className="text-[10px] text-muted hover:text-txt bg-surface-2 px-2 py-0.5 rounded-md border border-line transition-colors" title={t('mindmap.collapseAll')}>
                {t('mindmap.collapse')}
              </button>
              <button onClick={expandAll} className="text-[10px] text-muted hover:text-txt bg-surface-2 px-2 py-0.5 rounded-md border border-line transition-colors" title={t('mindmap.expandAll')}>
                {t('mindmap.expand')}
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {/* Zoom controls */}
          <div className="hidden sm:flex items-center bg-surface-2 border border-line rounded-lg overflow-hidden">
            <button onClick={() => zoomOut()} className="p-1.5 hover:bg-line transition-colors text-muted hover:text-txt" title={t('mindmap.zoomOut')}>
              <ZoomOut size={13} />
            </button>
            <div className="w-px h-5 bg-line" />
            <button onClick={() => fitView({ padding: 0.2, duration: 400 })} className="p-1.5 hover:bg-line transition-colors text-muted hover:text-txt" title={t('mindmap.fitView')}>
              <Crosshair size={13} />
            </button>
            <div className="w-px h-5 bg-line" />
            <button onClick={() => zoomIn()} className="p-1.5 hover:bg-line transition-colors text-muted hover:text-txt" title={t('mindmap.zoomIn')}>
              <ZoomIn size={13} />
            </button>
          </div>

          {/* Export */}
          <button
            onClick={handleExportPng}
            disabled={exporting}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-surface-2 border border-line rounded-lg hover:bg-line transition-all disabled:opacity-50 text-primary-400 hover:text-primary-300"
            title={t('mindmap.exportPng')}
          >
            {exporting ? <Loader2 size={12} className="animate-spin" /> : <ImageIcon size={12} />}
            <span className="hidden sm:inline">{t('mindmap.exportPng')}</span>
          </button>

          {/* Fullscreen */}
          <button
            onClick={toggleFullscreen}
            className="p-1.5 bg-surface-2 border border-line rounded-lg hover:bg-line transition-all text-muted hover:text-txt"
            title={isFullscreen ? t('mindmap.exitFullscreen') : t('mindmap.fullscreen')}
          >
            {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
        </div>
      </div>

      {/* Hint bar */}
      <div className="px-4 py-1.5 bg-surface-2/20 border-b border-line/50 text-[10px] text-muted flex items-center gap-4 shrink-0">
        <span>{t('mindmap.dragToMove')}</span>
        <span>•</span>
        <span>{t('mindmap.scrollToZoom')}</span>
        <span>•</span>
        <span className="hidden sm:inline">{t('mindmap.ctrlFullscreen')}</span>
      </div>

      {/* Canvas */}
      <div className="flex-1 relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: nodeCount > 60 ? 0.1 : nodeCount > 30 ? 0.15 : 0.25, duration: 600 }}
          minZoom={0.05}
          maxZoom={3}
          proOptions={{ hideAttribution: true }}
          defaultEdgeOptions={{
            type: 'smoothstep',
            style: { strokeWidth: 1.5 },
          }}
        >
          <Controls
            position="bottom-left"
            showFitView={false}
            showInteractive={false}
            showZoom={false}
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: '12px',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
              display: 'none',
            }}
          />
          <MiniMap
            position="bottom-right"
            nodeStrokeColor="var(--color-border)"
            nodeColor={(n) => {
              if (n.type === 'rootNode') return 'var(--color-primary-500)';
              if (n.type === 'branchNode') return n.data?._color?.fg || '#888';
              return 'var(--color-surface-2)';
            }}
            maskColor="var(--color-surface)"
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: '12px',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
              opacity: 0.85,
              height: 100,
              width: 150,
            }}
          />
          <Background color="var(--color-border)" gap={24} size={1} style={{ opacity: 0.5 }} />
        </ReactFlow>
      </div>
    </div>
  );
}
