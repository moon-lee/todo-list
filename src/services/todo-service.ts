import type { FinanceApi } from 'finance';
import { TodoDao, type Todo } from '../dao/todos.js';

export const MAX_TITLE_LENGTH = 200;

export function validateTitle(input: string): string {
  const title = input.trim();
  if (!title) throw new Error('Please enter a todo title.');
  if (title.length > MAX_TITLE_LENGTH) throw new Error(`Title must be ${MAX_TITLE_LENGTH} characters or less.`);
  return title;
}

export class TodoService {
  private dao: TodoDao;

  constructor(finance: FinanceApi) {
    this.dao = new TodoDao(finance);
  }

  list(): Promise<Todo[]> {
    return this.dao.list();
  }

  add(input: string): Promise<Todo> {
    return this.dao.create(validateTitle(input));
  }

  toggle(id: number, done: boolean): Promise<void> {
    return this.dao.setDone(id, done);
  }

  rename(id: number, input: string): Promise<void> {
    return this.dao.rename(id, validateTitle(input));
  }

  remove(id: number): Promise<void> {
    return this.dao.remove(id);
  }

  clearCompleted(): Promise<number> {
    return this.dao.clearCompleted();
  }

  counts(): Promise<{ total: number; active: number; done: number }> {
    return this.dao.counts();
  }

  count(): Promise<number> {
    return this.dao.count();
  }
}
