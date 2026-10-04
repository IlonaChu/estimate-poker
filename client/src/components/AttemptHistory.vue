<script setup>
import { TEAMS } from '../lib/constants.js';

const props = defineProps({ view: Object });

const person = (id) => props.view.participants.find((p) => p.id === id);

function summary(a) {
  if (a.numericCount === 0) return 'no numeric votes';
  if (a.consensus) return 'every team agreed';
  const split = TEAMS.filter((t) => a.teams[t.id].differ).map((t) => `${t.label} ${a.teams[t.id].min}–${a.teams[t.id].max}`);
  return `disagreement within: ${split.join(', ')}`;
}

function votesOf(attempt, team) {
  return Object.entries(attempt.votes)
    .map(([id, card]) => ({ p: person(id), card }))
    .filter((x) => x.p?.team === team);
}
</script>

<template>
  <section v-if="view.round?.history.length" class="card">
    <h3>Earlier attempts this round</h3>
    <details v-for="h in view.round.history" :key="h.attempt">
      <summary>Attempt {{ h.attempt }}: {{ summary(h.analysis) }}</summary>
      <p v-for="t in TEAMS" :key="t.id" class="small">
        <strong>{{ t.label }}:</strong>
        <template v-if="votesOf(h, t.id).length">
          <span v-for="x in votesOf(h, t.id)" :key="x.p.id" class="mini">{{ x.p.displayName }} {{ x.card }}</span>
        </template>
        <span v-else class="muted">no votes</span>
      </p>
    </details>
  </section>
</template>
