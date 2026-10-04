<script setup>
import { toasts } from './lib/toast.js';
</script>

<template>
  <header class="top">
    <router-link to="/" class="brand">🃏 Refinement Poker</router-link>
  </header>
  <main class="page">
    <router-view />
  </main>
  <div class="toasts" role="status" aria-live="polite">
    <div v-for="t in toasts" :key="t.id" class="toast">{{ t.message }}</div>
  </div>
</template>
