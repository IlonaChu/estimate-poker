<script setup>
import { computed } from 'vue';
import { TEAMS } from '../lib/constants.js';

const props = defineProps({ view: Object });

const a = computed(() => props.view.round.analysis);
const splitTeams = computed(() => TEAMS.filter((t) => a.value.teams[t.id].differ));

function who(ids) {
  return ids
    .map((id) => props.view.participants.find((p) => p.id === id))
    .filter(Boolean)
    .map((p) => p.displayName)
    .join(', ');
}
</script>

<template>
  <div v-if="a.numericCount === 0" class="banner neutral">No numeric votes were cast.</div>
  <div v-else-if="a.consensus" class="banner ok">🎉 Every team that voted is internally agreed</div>
  <div v-else class="banner warn">
    <strong>⚠ Some teams disagree internally</strong>
    <span v-if="a.largeGap" class="chip warn">Large gap</span>
    <p v-for="t in splitTeams" :key="t.id">
      <strong>{{ t.label }}</strong>: lowest <strong>{{ a.teams[t.id].min }}</strong> ({{ who(a.teams[t.id].lowestIds) }}),
      highest <strong>{{ a.teams[t.id].max }}</strong> ({{ who(a.teams[t.id].highestIds) }}) —
      {{ a.teams[t.id].distance }} step{{ a.teams[t.id].distance === 1 ? '' : 's' }} apart.
    </p>
    <p>Teams may estimate differently from each other; discuss within the disagreeing teams, then revote.</p>
  </div>
</template>
