export const TEAMS = [
  { id: 'frontend', label: 'Frontend', short: 'FE' },
  { id: 'mobile', label: 'Mobile', short: 'Mobile' },
  { id: 'backend', label: 'Backend', short: 'BE' },
  { id: 'qa', label: 'QA', short: 'QA' },
];
export const FIBONACCI = [1, 2, 3, 5, 8, 13, 21];
export const CARDS = [...FIBONACCI, '?', '☕'];

export const teamLabel = (id) => TEAMS.find((t) => t.id === id)?.label ?? id;
export const isHttpUrl = (value) => typeof value === 'string' && /^https?:\/\//i.test(value);
export const roundTitle = (r) => r.title || `Round ${r.number}`;
