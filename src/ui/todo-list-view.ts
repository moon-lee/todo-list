import { LitElement, html } from 'lit';
import { sharedStyles } from '../styles/shared-styles.js';
import type { FinanceApi } from 'finance';

const Base = typeof HTMLElement !== 'undefined' ? LitElement : class {} as unknown as typeof LitElement;

type Todo = { id: number; title: string };

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

  // allow host to inject FinanceApi after element creation
  setFinance(f: FinanceApi) {
    this.finance = f;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    if (this._finance) void this.loadTodos();
  }

  private async loadTodos() {
    if (!this._finance) return;
    try {
      const rows = await this._finance.db.table('todo_list_items').find();
      this.todos = (rows as unknown as Todo[]).slice().sort((a, b) => a.id - b.id);
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

  private async addTodo() {
    const title = this.draft.trim();
    if (!title) {
      this.error = 'Please enter a todo title.';
      this.requestUpdate();
      return;
    }
    this.loading = true;
    this.error = '';
    this.requestUpdate();
    try {
      if (this._finance) {
        try {
          const res = (await this._finance.db.table('todo_list_items').insert({ title } as never)) as unknown as Record<string, unknown>;
          const id = (res?.id as number) ?? Date.now();
          this.todos = [...this.todos, { id, title }];
        } catch (e) {
          const msg = String((e as Error)?.message ?? e);
          // if table not found, keep in-memory only
          if (msg.includes('TableNotFound') || msg.includes('TableAccessDenied')) {
            this.todos = [...this.todos, { id: Date.now(), title }];
          } else throw e;
        }
      } else {
        // no finance (standalone dev without injection) — in-memory
        this.todos = [...this.todos, { id: Date.now(), title }];
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

  override render() {
    if (typeof HTMLElement === 'undefined') return html``;
    return html`<div class="topbar"><span class="crumb-current">Todo List</span><div class="spacer"></div></div><div class="view-container"><div class="view-container-inner">
      <h1>Todo List</h1>
      <p>Your extension screen is ready — uses tokens + layout.</p>

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
          <thead><tr><th style="text-align:left;padding:8px 12px">#</th><th style="text-align:left;padding:8px 12px">Title</th></tr></thead>
          <tbody>
            ${this.todos.length === 0
              ? html`<tr><td colspan="2" class="empty" style="padding:16px;text-align:center">No todos yet — add one above.</td></tr>`
              : this.todos.map((t, i) => html`<tr><td style="padding:8px 12px">${i + 1}</td><td style="padding:8px 12px">${t.title}</td></tr>`)}
          </tbody>
        </table>
      </div>
    </div></div>`;
  }
}
