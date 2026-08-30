import type { FinanceApi } from 'finance';
import { ExtensionLogger } from 'finance-logger';
const logger = new ExtensionLogger('todo-list');
export async function registerUIComponents(): Promise<void> { if (typeof window !== 'undefined') await import('./ui/index.js'); }
let _finance: FinanceApi | null = null;
export async function activate(finance: FinanceApi, ctx: { viewId?: string } & Record<string, unknown> = {}): Promise<void> {
  _finance = finance;
  logger.info('activate todo-list', { viewId: ctx.viewId });
  finance.commands.registerCommand('todo-list.hello', 'Todo List: Hello', () => {
    finance.ui?.requestMount('todo-list', { greeting: 'Hello from todo-list' });
  });
  // Example Domain Service — other extensions can call finance.services.invoke('todo-list','count')
  // Add more methods (e.g. sum) when you add columns like `amount` to `todo_list_items`
  finance.services.register('todo-list', {
    count: async () => await finance.db.table('todo_list_items').count({}),
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
