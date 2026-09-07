import type { FinanceApi } from 'finance';

export type Todo = {
  id: number;
  title: string;
  isDone: boolean;
  /** Read-only: auto-added by main app, never written by us. */
  createdAt?: string;
};

function normalizeRow(row: Record<string, unknown>): Todo {
  const id = Number((row as { id?: unknown }).id ?? 0);
  const title = String((row as { title?: unknown }).title ?? '');
  const raw = (row as { is_done?: unknown }).is_done;
  const isDone = raw === true || raw === 1 || raw === '1' || raw === 'true';
  const createdRaw = (row as { created_at?: unknown }).created_at;
  const createdAt = typeof createdRaw === 'string' && createdRaw.length > 0 ? createdRaw : undefined;
  return createdAt ? { id, title, isDone, createdAt } : { id, title, isDone };
}

function affectedCount(res: unknown): number {
  if (typeof res === 'number') return res;
  if (res && typeof res === 'object' && 'affected' in (res as Record<string, unknown>)) {
    return Number((res as Record<string, unknown>).affected ?? 0);
  }
  return 0;
}

export class TodoDao {
  constructor(private finance: FinanceApi) {}

  private table() {
    return this.finance.db.table('todo_list_items');
  }

  async list(): Promise<Todo[]> {
    const rows = await this.table().find();
    return (rows as unknown as Record<string, unknown>[])
      .map(normalizeRow)
      .sort((a, b) => a.id - b.id);
  }

  async create(title: string): Promise<Todo> {
    // Never insert created_at — main app auto-adds it.
    const res = (await this.table().insert({ title, is_done: false } as never)) as unknown as Record<string, unknown>;
    const id = Number(res?.id ?? Date.now());
    // Re-read to pick up any auto-added columns (e.g. created_at from main).
    try {
      const row = await this.table().findOne({ id } as never);
      if (row) return normalizeRow(row as unknown as Record<string, unknown>);
    } catch {
      // fall through to constructed row
    }
    return { id, title, isDone: false };
  }

  async setDone(id: number, done: boolean): Promise<void> {
    await this.table().update({ id } as never, { is_done: done } as never);
  }

  async rename(id: number, title: string): Promise<void> {
    await this.table().update({ id } as never, { title } as never);
  }

  async remove(id: number): Promise<void> {
    await this.table().delete({ id } as never);
  }

  async clearCompleted(): Promise<number> {
    // Filter in memory: is_done may be stored as true/1/'1' depending on backend.
    const all = await this.list();
    let n = 0;
    for (const t of all) {
      if (t.isDone) {
        await this.remove(t.id);
        n += 1;
      }
    }
    return n;
  }

  async counts(): Promise<{ total: number; active: number; done: number }> {
    const all = await this.list();
    const done = all.filter((t) => t.isDone).length;
    return { total: all.length, active: all.length - done, done };
  }

  async count(): Promise<number> {
    return this.table().count({});
  }
}

export { affectedCount };
