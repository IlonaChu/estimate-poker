import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

const target = `http://localhost:${process.env.PORT || 3001}`;

export default defineConfig({
  plugins: [vue()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': target,
      '/socket.io': { target, ws: true },
    },
  },
});
