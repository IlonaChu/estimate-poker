import { reactive } from 'vue';

export const toasts = reactive([]);
let nextId = 1;

export function toast(message) {
  const item = { id: nextId++, message };
  toasts.push(item);
  setTimeout(() => {
    const i = toasts.indexOf(item);
    if (i >= 0) toasts.splice(i, 1);
  }, 4500);
}
