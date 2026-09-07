import type { FinanceApi } from 'finance';
import { ExtensionLogger } from 'finance-logger';
import './styles/ext-tokens.css';
import { TodoDao } from './dao/todos.js';
import { TodoService, validateTitle } from './services/todo-service.js';
const logger = new ExtensionLogger('todo-list');
export async function registerUIComponents(): Promise<void> { if (typeof window !== 'undefined') await import('./ui/index.js'); }
let _finance: FinanceApi | null = null;
export async function activate(finance: FinanceApi, ctx: { viewId?: string } & Record<string, unknown> = {}): Promise<void> {
  _finance = finance;
  logger.info('activate todo-list', { viewId: ctx.viewId });
  finance.commands.registerCommand('todo-list.hello', 'Todo List: Hello', () => {
    finance.ui?.requestMount('todo-list', { greeting: 'Hello from todo-list' });
  });
  finance.commands.registerCommand('todo-list.toggle', 'Todo List: Toggle Done', async (id?: unknown) => {
    const dao = new TodoDao(finance);
    const list = await dao.list();
    const target = typeof id === 'number' ? list.find((t) => t.id === id) : list.find((t) => !t.isDone);
    if (!target) throw new Error('No matching todo to toggle.');
    await dao.setDone(target.id, !target.isDone);
  });
  finance.commands.registerCommand('todo-list.clearCompleted', 'Todo List: Clear Completed', async () => {
    const dao = new TodoDao(finance);
    await dao.clearCompleted();
  });
  finance.commands.registerCommand('todo-list.add', 'Todo List: Add Todo', async (title?: unknown) => {
    await new TodoDao(finance).create(validateTitle(String(title ?? '')));
  });
  // Domain Service — other extensions can call finance.services.invoke('todo-list','count')
  finance.services.register('todo-list', {
    count: async () => await new TodoService(finance).count(),
    counts: async () => await new TodoService(finance).counts(),
    list: async () => await new TodoService(finance).list(),
  });
  if (typeof window !== 'undefined') await import('./ui/index.js');
  if (ctx.viewId && typeof document !== 'undefined') {
    const app = document.getElementById('app');
    if (app) {
      const viewEl = document.createElement('todo-list-view') as any;
      app.innerHTML = '';
      app.appendChild(viewEl);
      queueMicrotask(() => { if (typeof viewEl.setFinance === 'function') viewEl.setFinance(finance); else viewEl.finance = finance; });
      setTimeout(() => { if (viewEl.finance == null && typeof viewEl.setFinance === 'function') viewEl.setFinance(finance); }, 50);
    }
  }
}
export function deactivate(): void { if (_finance) _finance.services.unregister('todo-list'); logger.info('deactivate todo-list'); }
