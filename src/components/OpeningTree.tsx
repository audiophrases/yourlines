import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useStore } from '../store/useStore';
import { sortedChildren, score } from '../lib/tree';
import { nameSegments } from '../lib/openings';
import type { TreeNode } from '../lib/types';
import { ScoreBar, ScorePill, moveNumber } from './ui';

const MAX_PLY_SHOWN = 20;
const TOP_PER_NODE = 5;

function keyOf(node: TreeNode): string {
  return node.line.join('/');
}

/** The new opening label introduced at this node vs its parent, if any. */
function newLabel(node: TreeNode, parent: TreeNode | null): string | null {
  if (!node.opening) return null;
  const parentName = parent?.namePath?.name;
  if (parentName === node.opening.name) return null;
  const segs = nameSegments(node.opening.name);
  // If the parent had no name yet, show the family; otherwise the refinement.
  return parent?.namePath ? segs[segs.length - 1] : segs[0];
}

export function OpeningTree() {
  const repertoire = useStore((s) => s.repertoire());
  const path = useStore((s) => s.path);
  const navTo = useStore((s) => s.navTo);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const minGames = useMemo(
    () => (repertoire ? Math.max(2, Math.floor(repertoire.games * 0.02)) : 2),
    [repertoire],
  );

  // Keep the current line's ancestors expanded as the user navigates.
  useEffect(() => {
    setExpanded((prev) => {
      const next = new Set(prev);
      for (let i = 0; i <= path.length; i++) next.add(path.slice(0, i).join('/'));
      return next;
    });
  }, [path]);

  if (!repertoire) return null;
  const root = repertoire.tree;

  const currentKey = path.join('/');

  const rows: ReactNode[] = [];
  const walk = (node: TreeNode, parent: TreeNode | null, depth: number) => {
    if (node !== root) {
      const isOpen = expanded.has(keyOf(node));
      const onPath = currentKey === keyOf(node);
      const kids = sortedChildren(node).filter((c) => c.games >= minGames);
      const hasKids = kids.length > 0 && node.ply < MAX_PLY_SHOWN;
      const label = newLabel(node, parent);
      rows.push(
        <TreeRow
          key={keyOf(node)}
          node={node}
          parent={parent}
          depth={depth}
          label={label}
          isOpen={isOpen}
          hasKids={hasKids}
          onPath={onPath}
          onToggle={() =>
            setExpanded((prev) => {
              const next = new Set(prev);
              const k = keyOf(node);
              if (next.has(k)) next.delete(k);
              else next.add(k);
              return next;
            })
          }
          onSelect={() => navTo(node.line)}
        />,
      );
      if (!isOpen || node.ply >= MAX_PLY_SHOWN) return;
    }
    const kids = sortedChildren(node).filter((c) => c.games >= minGames);
    const shown = kids.slice(0, TOP_PER_NODE);
    for (const child of shown) walk(child, node, depth + (node === root ? 0 : 1));
    if (kids.length > shown.length) {
      rows.push(
        <div
          key={`${keyOf(node)}#more`}
          className="py-0.5 text-[11px] text-mist-500"
          style={{ paddingLeft: (depth + 1) * 16 + 8 }}
        >
          +{kids.length - shown.length} more rare line{kids.length - shown.length === 1 ? '' : 's'}
        </div>,
      );
    }
  };
  walk(root, null, 0);

  return (
    <div className="scroll-slim max-h-full overflow-y-auto pr-1">
      {rows.length === 0 ? (
        <p className="px-2 py-6 text-center text-sm text-mist-500">
          Not enough games yet to build a tree for this color.
        </p>
      ) : (
        rows
      )}
    </div>
  );
}

function TreeRow({
  node,
  depth,
  label,
  isOpen,
  hasKids,
  onPath,
  onToggle,
  onSelect,
}: {
  node: TreeNode;
  parent: TreeNode | null;
  depth: number;
  label: string | null;
  isOpen: boolean;
  hasKids: boolean;
  onPath: boolean;
  onToggle: () => void;
  onSelect: () => void;
}) {
  return (
    <div
      className={`group flex items-center gap-2 rounded-md py-1 pr-2 transition-colors ${
        onPath ? 'bg-amber/12' : 'hover:bg-ink-800'
      }`}
      style={{ paddingLeft: depth * 16 }}
    >
      <button
        onClick={onToggle}
        className={`flex h-4 w-4 shrink-0 items-center justify-center text-mist-500 ${
          hasKids ? 'visible' : 'invisible'
        }`}
      >
        <span className={`transition-transform ${isOpen ? 'rotate-90' : ''}`}>›</span>
      </button>
      <button onClick={onSelect} className="flex min-w-0 flex-1 items-center gap-2 text-left">
        <span className="w-16 shrink-0 font-mono text-sm">
          <span className="text-mist-500">{node.ply % 2 === 1 ? moveNumber(node.ply) : ''}</span>
          <span className={onPath ? 'text-amber' : 'text-mist-100'}> {node.move}</span>
        </span>
        {label && (
          <span
            title={node.opening?.name}
            className="truncate rounded bg-ink-700/70 px-1.5 py-0.5 text-[11px] text-mist-300"
          >
            {label}
          </span>
        )}
        <span className="ml-auto shrink-0 text-[11px] tabular-nums text-mist-500">
          {node.games}
        </span>
        <div className="w-16 shrink-0">
          <ScoreBar wins={node.wins} draws={node.draws} losses={node.losses} height={5} />
        </div>
        <div className="w-10 shrink-0 text-right">
          <ScorePill score={score(node)} />
        </div>
      </button>
    </div>
  );
}
