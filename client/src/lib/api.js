// Backend origin; empty means same origin (dev proxy or the Node server serving the build).
export const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
