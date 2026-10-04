<script setup>
import { computed } from 'vue';
import { teamLabel } from '../lib/constants.js';

const props = defineProps({ view: Object });

const a = computed(() => props.view.round.analysis);

function who(ids) {
  return ids
    .map((id) => props.view.participants.find((p) => p.id === id))
    .filter(Boolean)
    .map((p) => `${p.displayName} (${teamLabel(p.team)})`)
    .join(', ');
}
</script>

<template>
  <div v-if="a.numericCount === 0" class="banner neutral">No numeric votes were cast.</div>
  <div v-else-if="a.consensus" class="banner ok">🎉 Consensus: everyone who voted picked <strong>{{ a.min }}</strong></div>
  <div v-else class="banner warn">
    <strong>⚠ Estimates differ</strong>
    <span v-if="a.largeGap" class="chip warn">Large gap</span>
    <p>
      Lowest <strong>{{ a.min }}</strong>: {{ who(a.lowestIds) }}<br />
      Highest <strong>{{ a.max }}</strong>: {{ who(a.highestIds) }}<br />
      {{ a.distance }} step{{ a.distance === 1 ? '' : 's' }} apart on the Fibonacci scale. Discuss, then revote.
    </p>
  </div>
</template>
