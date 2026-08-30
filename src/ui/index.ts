import { SampleView } from './todo-list-view';
if (typeof customElements !== 'undefined' && !customElements.get('todo-list-view')) customElements.define('todo-list-view', SampleView as unknown as CustomElementConstructor);
