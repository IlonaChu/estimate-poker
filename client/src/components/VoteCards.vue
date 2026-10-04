<script setup>
import { CARDS } from '../lib/constants.js';

defineProps({ selected: { type: [Number, String], default: null } });
defineEmits(['pick']);

const label = (c) => (c === '?' ? 'Not sure' : c === '☕' ? 'Pass, no estimate from me' : `${c} points`);
</script>

<template>
  <div>
    <p class="muted">Pick your estimate. You can change it until the PO reveals the votes.</p>
    <div class="cards" role="group" aria-label="Estimate cards">
      <button
        v-for="c in CARDS"
        :key="c"
        type="button"
        class="vote-card"
        :class="{ selected: selected === c }"
        :aria-pressed="selected === c"
        :aria-label="label(c)"
        @click="$emit('pick', selected === c ? null : c)"
      >
        {{ c }}
      </button>
    </div>
    <p v-if="selected !== null" class="muted small">Your vote is in ✓ (click it again to withdraw)</p>
  </div>
</template>
