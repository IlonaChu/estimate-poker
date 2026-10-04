<script setup>
import { computed } from 'vue';
import { TEAMS } from '../lib/constants.js';

const props = defineProps({ view: Object });

const round = computed(() => props.view.round);
const revealed = computed(() => Boolean(round.value?.revealed));
const voting = computed(() => props.view.status === 'voting');

const columns = computed(() =>
  TEAMS.map((team) => {
    const members = props.view.participants.filter((p) => p.team === team.id);
    return {
      ...team,
      members,
      voted: members.filter((p) => p.hasVoted).length,
      stats: round.value?.analysis?.teams?.[team.id] ?? null,
    };
  }),
);

function voteText(p) {
  const v = round.value.votes[p.id];
  if (v === undefined) return 'no vote';
  if (v === '☕') return '☕ pass';
  return String(v);
}

function tag(p) {
  const a = round.value?.analysis;
  if (a?.lowestIds.includes(p.id)) return { cls: 'lowest', text: '▼ lowest' };
  if (a?.highestIds.includes(p.id)) return { cls: 'highest', text: '▲ highest' };
  return null;
}
</script>

<template>
  <div class="board">
    <section v-for="col in columns" :key="col.id" class="team card">
      <h3>
        {{ col.label }}
        <span v-if="voting" class="muted small">{{ col.voted }}/{{ col.members.length }} voted</span>
      </h3>

      <p v-if="revealed && col.stats">
        <span v-if="col.stats.count === 0" class="badge muted-badge">Did not vote</span>
        <span v-else-if="col.stats.differ" class="badge warn">⚠ Team disagrees ({{ col.stats.min }}–{{ col.stats.max }})</span>
        <span v-else class="badge ok">✓ Agreed: {{ col.stats.min }}</span>
      </p>

      <p v-if="!col.members.length" class="muted small">Nobody here yet</p>
      <ul class="plain">
        <li v-for="p in col.members" :key="p.id" class="person">
          <span class="name" :class="{ offline: !p.online }">
            {{ p.displayName }}<span v-if="!p.online" class="muted small"> (offline)</span>
          </span>
          <span v-if="voting" class="status" :class="{ done: p.hasVoted }">{{ p.hasVoted ? '✓ voted' : '… waiting' }}</span>
          <span v-else-if="revealed" class="status">
            <span class="face" :class="tag(p)?.cls">{{ voteText(p) }}</span>
            <span v-if="tag(p)" class="tagtext" :class="tag(p).cls">{{ tag(p).text }}</span>
          </span>
        </li>
      </ul>
    </section>
  </div>
</template>
