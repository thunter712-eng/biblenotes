import { objectBbox, unionBbox } from './geometry.ts';
import type { Bbox, PageObject } from './types.ts';

export interface Op {
  removed: PageObject[];
  added: PageObject[];
}

export interface ChangeEvent extends Op {
  /** Area needing a repaint, or null if nothing visible changed. */
  rect: Bbox | null;
}

const byPaintOrder = (a: PageObject, b: PageObject) => a.z - b.z || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * A page's objects and its undo stacks. All edits are expressed as {removed, added}: updating an
 * object is removing the old version and adding the new one under the same id. That gives undo a
 * single rule, swap the two lists, and tells autosave exactly which rows changed.
 */
export class PageDocument {
  private map = new Map<string, PageObject>();
  private sorted: PageObject[] = [];
  private needsSort = false;
  private undoStack: Op[] = [];
  private redoStack: Op[] = [];
  private nextZ = 1;
  private listeners = new Set<(e: ChangeEvent) => void>();

  /** Rows that autosave has yet to write or delete. */
  readonly dirty = new Set<string>();
  readonly deleted = new Set<string>();

  constructor(objects: PageObject[] = []) {
    for (const o of objects) {
      this.map.set(o.id, o);
      this.nextZ = Math.max(this.nextZ, o.z + 1);
    }
    this.sorted = [...objects].sort(byPaintOrder);
  }

  get objects(): readonly PageObject[] {
    if (this.needsSort) {
      this.sorted.sort(byPaintOrder);
      this.needsSort = false;
    }
    return this.sorted;
  }

  get size() { return this.map.size; }
  get(id: string) { return this.map.get(id); }
  allocZ() { return this.nextZ++; }
  get canUndo() { return this.undoStack.length > 0; }
  get canRedo() { return this.redoStack.length > 0; }

  onChange(fn: (e: ChangeEvent) => void) {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  private apply(removed: PageObject[], added: PageObject[]) {
    const gone = new Set<string>();
    for (const o of removed) {
      if (this.map.delete(o.id)) {
        gone.add(o.id);
        this.dirty.delete(o.id);
        this.deleted.add(o.id);
      }
    }
    if (gone.size) this.sorted = this.sorted.filter((o) => !gone.has(o.id));
    for (const o of added) {
      this.map.set(o.id, o);
      this.deleted.delete(o.id);
      this.dirty.add(o.id);
      const last = this.sorted[this.sorted.length - 1];
      if (last && byPaintOrder(last, o) > 0) this.needsSort = true;
      this.sorted.push(o);
      if (o.z >= this.nextZ) this.nextZ = o.z + 1;
    }
    const rect = unionBbox([...removed, ...added].map(objectBbox));
    const event: ChangeEvent = { removed, added, rect };
    this.listeners.forEach((l) => l(event));
  }

  /** Applies an edit and records it for undo. */
  commit(op: Op) {
    if (!op.removed.length && !op.added.length) return;
    this.apply(op.removed, op.added);
    this.undoStack.push(op);
    this.redoStack.length = 0;
  }

  /** Applies an edit mid-gesture. The gesture records the whole thing with pushHistory when it ends. */
  applySilently(removed: PageObject[], added: PageObject[]) {
    this.apply(removed, added);
  }

  pushHistory(op: Op) {
    if (!op.removed.length && !op.added.length) return;
    this.undoStack.push(op);
    this.redoStack.length = 0;
    this.listeners.forEach((l) => l({ removed: [], added: [], rect: null }));
  }

  undo(): Op | null {
    const op = this.undoStack.pop();
    if (!op) return null;
    this.apply(op.added, op.removed);
    this.redoStack.push(op);
    return op;
  }

  redo(): Op | null {
    const op = this.redoStack.pop();
    if (!op) return null;
    this.apply(op.removed, op.added);
    this.undoStack.push(op);
    return op;
  }
}
