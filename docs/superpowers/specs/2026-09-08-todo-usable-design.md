# Todo List — Usable Upgrade Design (2026-09-08)

## Goal
Make `todo-list` basically usable: toggle done, edit, delete, filter, counts. No `created_at` in our manifest — main app auto-adds it.

## 1. Data + Architecture (Approved)
**Manifest `todo_list_items`:**
- `title: text, nullable:false`
- `is_done: boolean, nullable:false?, default:false`

No `created_at` declared. Never `insert({created_at})`. Insert only `{title, is_done:false}`.

**Read rule:**
- Missing `is_done` → false.
- `created_at` read opportunistically if main returns it (display only), else sort by `id asc`.

**Files (Approach B — DAO+service split):**
- `src/dao/todos.ts` — typed wrapper: `list(), create(title), setDone(id,done), rename(id,title), remove(id), clearCompleted(), counts()`
- `src/services/todo-service.ts` — validation (non-empty, ≤200 chars trim), toggle with rollback data, counts
- `src/ui/todo-list-view.ts` — thin Lit view, calls service only, no raw SQL logic
- `src/main.ts` — keep `typeof window` guard, keep `registerUIComponents`, add commands `todo-list.toggle`, `todo-list.clearCompleted`

Constraints: prefix `todo_list_` kept, `import type {FinanceApi} from 'finance'`, no top-level `HTMLElement`.

## 2. Features + Behavior (Approved)
- Toggle done via checkbox → `update({id},{is_done})`, optimistic UI + rollback on error.
- Inline edit: double-click / Edit btn, Enter saves, Esc cancels, validation message inline.
- Delete per row with confirm, plus Clear-completed button (deletes `is_done=true`).
- Filter All/Active/Done + counts `total/active/done` in UI.
- Sort by `id asc` only. `created_at` if present shown read-only, never written.
- Errors surfaced red: `ValidationFailed`, `TableAccessDenied`, generic fallback. Dev mock keeps in-memory fallback on `TableNotFound`.

## 3. UI + Integration (Approved)
- Layout: `.topbar` (crumb `Todo List`, spacer, filter All/Active/Done, Clear-completed) + `.view-container-inner`.
- Table: Done checkbox | Title (strike-through when done) | Actions Edit/Delete. Empty states per filter (“No active todos”, etc.).
- Styles: tokens `var(--ff-*)` only, sharedStyles, no hard-coded colors.
- `allowedCommands`: add `todo-list.toggle`, `todo-list.clearCompleted`. `allowedUiEvents`: stays `[]` (no new CustomEvents).
- Logging: `ExtensionLogger('todo-list')`, no `console.log`. Optional setting `todo-list.showCompleted`.

## 4. Verification + Build (Approved)
- `npm run dev`: Add/toggle/edit/delete/filter/clear works with mock.
- Install+restart real DB: `SELECT * FROM todo_list_items` shows title/is_done (+ auto created_at from main, not us).
- Guards: no `HTMLElement` at top-level, `finance` type-only, bundle <200KB, try/catch all db calls.
- Bump patch `0.1.3→0.1.4` in both version fields, commit, `npm run build` → Install Folder → restart → panel verify → Delete Data → DROP verified.

## Self-review
- No placeholders. No contradiction: created_at excluded from manifest/insert, read-only if present. Scope limited to 6 behaviors, no search/sort/priorities. No unrelated refactoring.
