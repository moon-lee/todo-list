import { LitElement, html } from 'lit';
import { sharedStyles } from '../styles/shared-styles.js';
import type { FinanceApi } from 'finance';
import { TodoService, validateTitle } from '../services/todo-service.js';
import type { Todo } from '../dao/todos.js';

const Base = typeof HTMLElement !== 'undefined' ? LitElement : class {} as unknown as typeof LitElement;

type Filter = 'all' | 'active' | 'done';

export class SampleView extends Base {
  static override styles = typeof HTMLElement !== 'undefined' ? [sharedStyles] as any : [];

  // injected by host (panel-bootstrap / main.ts / dev index.html)
  private _finance?: FinanceApi;
  get finance(): FinanceApi | undefined { return this._finance; }
  set finance(f: FinanceApi | undefined) {
    this._finance = f;
    if (f) void this.loadTodos();
  }

  private todos: Todo[] = [];
  private draft = '';
  private error = '';
  private loading = false;
  private filter: Filter = 'all';
  private editingId: number | null = null;
  private editingDraft = '';
  private busyIds = new Set<number>();
  private service: TodoService | null = null;
  private memNextId = 1;

  // allow host to inject FinanceApi after element creation
  setFinance(f: FinanceApi) {
    this.finance = f;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    if (this._finance) void this.loadTodos();
  }

  private ensureService(): TodoService | null {
    if (!this._finance) return null;
    if (!this.service) this.service = new TodoService(this._finance);
    return this.service;
  }

  private get visibleTodos(): Todo[] {
    if (this.filter === 'active') return this.todos.filter((t) => !t.isDone);
    if (this.filter === 'done') return this.todos.filter((t) => t.isDone);
    return this.todos;
  }

  private get counts(): { total: number; active: number; done: number } {
    const done = this.todos.filter((t) => t.isDone).length;
    return { total: this.todos.length, active: this.todos.length - done, done };
  }

  private async loadTodos() {
    const svc = this.ensureService();
    if (!svc) return;
    try {
      this.todos = await svc.list();
      this.error = '';
    } catch (e) {
      // table may not exist yet in dev mock until first insert - fallback to in-memory
      // keep existing in-memory todos if DB fails
      if (String((e as Error)?.message ?? '').includes('TableNotFound')) {
        this.error = '';
      } else {
        this.error = e instanceof Error ? e.message : String(e);
      }
    }
    this.requestUpdate();
  }

  private onInput(e: Event) {
    this.draft = (e.target as HTMLInputElement).value;
    if (this.error) this.error = '';
  }

  private onKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') void this.addTodo();
  }

  private setFilter(f: Filter) {
    this.filter = f;
    this.requestUpdate();
  }

  private async addTodo() {
    let title: string;
    try {
      title = validateTitle(this.draft);
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      this.requestUpdate();
      return;
    }
    this.loading = true;
    this.error = '';
    this.requestUpdate();
    try {
      const svc = this.ensureService();
      if (svc) {
        try {
          const created = await svc.add(title);
          this.todos = [...this.todos, created].sort((a, b) => a.id - b.id);
        } catch (e) {
          const msg = String((e as Error)?.message ?? e);
          // if table not found, keep in-memory only
          if (msg.includes('TableNotFound') || msg.includes('TableAccessDenied')) {
            this.todos = [...this.todos, { id: Date.now(), title, isDone: false }].sort((a, b) => a.id - b.id);
          } else throw e;
        }
      } else {
        // no finance (standalone dev without injection) — in-memory
        this.todos = [...this.todos, { id: this.memNextId++, title, isDone: false }];
      }
      this.draft = '';
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    } finally {
      this.loading = false;
      this.requestUpdate();
      // clear input element value after requestUpdate
      this.updateComplete.then(() => {
        const inp = this.renderRoot?.querySelector('input') as HTMLInputElement | null;
        if (inp) inp.value = this.draft;
      });
    }
  }

  private async toggleTodo(t: Todo) {
    const next = !t.isDone;
    // optimistic update with rollback
    this.todos = this.todos.map((x) => (x.id === t.id ? { ...x, isDone: next } : x));
    this.busyIds.add(t.id);
    this.requestUpdate();
    try {
      const svc = this.ensureService();
      if (svc) {
        await svc.toggle(t.id, next);
        this.todos = await svc.list();
      }
      this.error = '';
    } catch (e) {
      this.todos = this.todos.map((x) => (x.id === t.id ? { ...x, isDone: t.isDone } : x));
      this.error = e instanceof Error ? e.message : String(e);
    } finally {
      this.busyIds.delete(t.id);
      this.requestUpdate();
    }
  }

  private startEdit(t: Todo) {
    this.editingId = t.id;
    this.editingDraft = t.title;
    this.error = '';
    this.requestUpdate();
    this.updateComplete.then(() => {
      const inp = this.renderRoot?.querySelector(`input[data-edit-id="${t.id}"]`) as HTMLInputElement | null;
      inp?.focus();
      inp?.select();
    });
  }

  private cancelEdit() {
    this.editingId = null;
    this.editingDraft = '';
    this.requestUpdate();
  }

  private onEditInput(e: Event) {
    this.editingDraft = (e.target as HTMLInputElement).value;
  }

  private onEditKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      const t = this.todos.find((x) => x.id === this.editingId);
      if (t) void this.saveEdit(t);
    } else if (e.key === 'Escape') {
      this.cancelEdit();
    }
  }

  private async saveEdit(t: Todo) {
    let title: string;
    try {
      title = validateTitle(this.editingDraft);
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      this.requestUpdate();
      return;
    }
    this.busyIds.add(t.id);
    this.requestUpdate();
    try {
      const svc = this.ensureService();
      if (svc) {
        await svc.rename(t.id, title);
        this.todos = await svc.list();
      } else {
        this.todos = this.todos.map((x) => (x.id === t.id ? { ...x, title } : x));
      }
      this.editingId = null;
      this.editingDraft = '';
      this.error = '';
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    } finally {
      this.busyIds.delete(t.id);
      this.requestUpdate();
    }
  }

  private async deleteTodo(t: Todo) {
    if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
      if (!window.confirm(`Delete "${t.title}"?`)) return;
    }
    this.busyIds.add(t.id);
    this.requestUpdate();
    try {
      const svc = this.ensureService();
      if (svc) {
        await svc.remove(t.id);
        this.todos = await svc.list();
      } else {
        this.todos = this.todos.filter((x) => x.id !== t.id);
      }
      if (this.editingId === t.id) {
        this.editingId = null;
        this.editingDraft = '';
      }
      this.error = '';
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    } finally {
      this.busyIds.delete(t.id);
      this.requestUpdate();
    }
  }

  private async clearCompleted() {
    const svc = this.ensureService();
    this.loading = true;
    this.requestUpdate();
    try {
      if (svc) {
        await svc.clearCompleted();
        this.todos = await svc.list();
      } else {
        this.todos = this.todos.filter((t) => !t.isDone);
      }
      this.error = '';
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    } finally {
      this.loading = false;
      this.requestUpdate();
    }
  }

  private emptyMessage(): string {
    if (this.todos.length === 0) return 'No todos yet — add one above.';
    if (this.filter === 'active') return 'No active todos — all done.';
    if (this.filter === 'done') return 'No completed todos yet.';
    return 'No todos.';
  }

  override render() {
    if (typeof HTMLElement === 'undefined') return html``;
    const c = this.counts;
    const visible = this.visibleTodos;
    return html`<div class="view-scroll"><div class="topbar"><span class="crumb-current">Todo List</span><div class="spacer"></div>
      <button class="filter-btn" style=${this.filter === 'all' ? 'border-color:var(--ff-accent,#007acc)' : ''} @click=${() => this.setFilter('all')}>All (${c.total})</button>
      <button class="filter-btn" style=${this.filter === 'active' ? 'border-color:var(--ff-accent,#007acc)' : ''} @click=${() => this.setFilter('active')}>Active (${c.active})</button>
      <button class="filter-btn" style=${this.filter === 'done' ? 'border-color:var(--ff-accent,#007acc)' : ''} @click=${() => this.setFilter('done')}>Done (${c.done})</button>
      <button class="filter-btn" @click=${() => this.clearCompleted()} ?disabled=${this.loading || c.done === 0}>Clear completed</button>
    </div><div class="view-container"><div class="view-container-inner">
      <h1>Todo List</h1>
      <p>${c.active} active · ${c.done} done · ${c.total} total</p>

      <div class="section" style="margin-top:16px">
        <div class="section-header"><h3 class="section-title">Add Todo</h3></div>
        <div class="section-body">
          <div style="display:flex;gap:8px;align-items:flex-start">
            <div class="field" style="flex:1">
              <input
                placeholder="What needs to be done?"
                .value=${this.draft}
                @input=${this.onInput}
                @keydown=${this.onKeydown}
                ?disabled=${this.loading}
              />
              ${this.error ? html`<div class="field-error">${this.error}</div>` : ''}
            </div>
            <button class="btn btn-primary" @click=${() => this.addTodo()} ?disabled=${this.loading}>
              ${this.loading ? 'Adding…' : 'Add'}
            </button>
          </div>
        </div>
      </div>

      <div class="table-wrap" style="margin-top:16px">
        <table style="width:100%;border-collapse:collapse">
          <thead><tr><th style="text-align:left;padding:8px 12px;width:36px">Done</th><th style="text-align:left;padding:8px 12px">Title</th><th style="text-align:left;padding:8px 12px;width:190px;white-space:nowrap">Actions</th></tr></thead>
          <tbody>
            ${visible.length === 0
              ? html`<tr><td colspan="3" class="empty" style="padding:16px;text-align:center">${this.emptyMessage()}</td></tr>`
              : visible.map((t) => html`<tr>
                  <td style="padding:8px 12px"><input type="checkbox" .checked=${t.isDone} ?disabled=${this.busyIds.has(t.id)} @change=${() => this.toggleTodo(t)} aria-label="Mark ${t.title} ${t.isDone ? 'not done' : 'done'}" /></td>
                  <td style="padding:8px 12px">
                    ${this.editingId === t.id
                      ? html`<input data-edit-id=${t.id} .value=${this.editingDraft} @input=${this.onEditInput} @keydown=${this.onEditKeydown} ?disabled=${this.busyIds.has(t.id)} />`
                      : html`<span style=${t.isDone ? 'text-decoration:line-through;opacity:0.7' : ''}>${t.title}</span>`}
                  </td>
                  <td style="padding:8px 12px;white-space:nowrap">
                    ${this.editingId === t.id
                      ? html`<div style="display:flex;gap:6px;flex-wrap:nowrap;align-items:center"><button class="btn btn-primary" @click=${() => this.saveEdit(t)} ?disabled=${this.busyIds.has(t.id)}>Save</button><button class="btn btn-secondary" @click=${() => this.cancelEdit()}>Cancel</button></div>`
                      : html`<div style="display:flex;gap:6px;flex-wrap:nowrap;align-items:center"><button class="btn btn-secondary" @click=${() => this.startEdit(t)} ?disabled=${this.busyIds.has(t.id)}>Edit</button><button class="btn btn-secondary" @click=${() => this.deleteTodo(t)} ?disabled=${this.busyIds.has(t.id)}>Delete</button></div>`}
                  </td>
                </tr>`)}
          </tbody>
        </table>
      </div>
    </div></div></div>`;
  }
}
