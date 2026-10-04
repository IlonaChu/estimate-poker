<script setup>
import { computed, ref } from 'vue';
import { TEAMS, isHttpUrl, roundTitle } from '../lib/constants.js';
import { copyText, download, toCsv, toMarkdown, toMembersCsv } from '../lib/export.js';
import { toast } from '../lib/toast.js';

const props = defineProps({ rounds: { type: Array, default: () => [] }, hostName: String, compact: Boolean });

async function copyMarkdown() {
  toast((await copyText(toMarkdown(props.rounds, props.hostName))) ? 'Summary copied as Markdown' : 'Could not copy');
}
const downloadCsv = () => download('refinement-summary.csv', toCsv(props.rounds));
const mode = ref('team');
const open = ref(new Set());
function toggle(n) {
  const next = new Set(open.value);
  if (!next.delete(n)) next.add(n);
  open.value = next;
}
const lastAttempt = (r) => r.attemptDetails?.[r.attemptDetails.length - 1];
const cardOf = (r, id) => lastAttempt(r)?.members.find((m) => m.id === id)?.card ?? null;
const cardText = (card) => (card === null || card === undefined ? '—' : card);
const membersOf = (attempt, team) => attempt.members.filter((m) => m.team === team);

// Everyone who appears in any round, grouped by team, in a stable order.
const people = computed(() => {
  const seen = new Map();
  for (const r of props.rounds) for (const a of r.attemptDetails ?? []) for (const m of a.members) seen.set(m.id, m);
  return TEAMS.map((t) => ({ ...t, members: [...seen.values()].filter((m) => m.team === t.id) })).filter((t) => t.members.length);
});
const hasDetails = computed(() => props.rounds.some((r) => r.attemptDetails?.length));

const downloadMembersCsv = () => download('refinement-members.csv', toMembersCsv(props.rounds));
const consensusText = (r) => (r.consensus === null ? '—' : r.consensus ? '✓ yes' : '✗ no');
</script>

<template>
  <section class="card">
    <h2>{{ compact ? 'Results so far' : 'Session summary' }}</h2>
    <p v-if="!rounds.length" class="muted">No rounds were completed.</p>
    <div v-if="rounds.length && hasDetails" class="row tabs">
      <button :class="{ primary: mode === 'team' }" @click="mode = 'team'">Per team</button>
      <button :class="{ primary: mode === 'member' }" @click="mode = 'member'">Per member</button>
    </div>
    <div v-if="rounds.length && mode === 'member' && hasDetails" class="table-wrap">
      <p class="muted small">Each member's card in the last attempt of every round. — means no vote.</p>
      <table>
        <thead>
          <tr>
            <th>Member</th>
            <th v-for="r in rounds" :key="r.number" :title="roundTitle(r)">#{{ r.number }}</th>
          </tr>
        </thead>
        <tbody v-for="t in people" :key="t.id">
          <tr class="group"><th :colspan="rounds.length + 1">{{ t.label }}</th></tr>
          <tr v-for="m in t.members" :key="m.id">
            <td>{{ m.name }}</td>
            <td v-for="r in rounds" :key="r.number">{{ cardText(cardOf(r, m.id)) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-else-if="rounds.length" class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Story</th>
            <th v-for="t in TEAMS" :key="t.id">{{ t.label }}</th>
            <th>Total</th>
            <th>Attempts</th>
            <th>Consensus</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="r in rounds" :key="r.number">
          <tr>
            <td>
              <button v-if="r.attemptDetails?.length" class="link" :aria-expanded="open.has(r.number)" @click="toggle(r.number)">
                {{ open.has(r.number) ? '▾' : '▸' }} {{ r.number }}
              </button>
              <template v-else>{{ r.number }}</template>
            </td>
            <td>
              <a v-if="isHttpUrl(r.link)" :href="r.link" target="_blank" rel="noopener noreferrer">{{ roundTitle(r) }}</a>
              <template v-else>{{ roundTitle(r) }}</template>
            </td>
            <td v-for="t in TEAMS" :key="t.id">{{ r.final?.teams?.[t.id] ?? '—' }}</td>
            <td>
              <strong>{{ r.final?.total ?? '—' }}</strong>
            </td>
            <td>{{ r.attempts }}</td>
            <td>{{ consensusText(r) }}</td>
          </tr>
          <tr v-if="open.has(r.number)" class="detail">
            <td :colspan="TEAMS.length + 5">
              <div v-for="a in r.attemptDetails" :key="a.attempt" class="attempt">
                <strong>Attempt {{ a.attempt }}</strong>
                <span class="muted small"> {{ consensusText(a) }} consensus</span>
                <p v-for="t in TEAMS" :key="t.id" class="small">
                  <strong>{{ t.label }}:</strong>
                  <template v-if="membersOf(a, t.id).length">
                    <span v-for="m in membersOf(a, t.id)" :key="m.id" class="mini">{{ m.name }} {{ cardText(m.card) }}</span>
                  </template>
                  <span v-else class="muted">nobody</span>
                </p>
              </div>
            </td>
          </tr>
          </template>
        </tbody>
      </table>
    </div>
    <div v-if="!compact && rounds.length" class="row">
      <button @click="copyMarkdown">Copy as Markdown</button>
      <button @click="downloadCsv">Download CSV</button>
      <button v-if="hasDetails" @click="downloadMembersCsv">Download per-member CSV</button>
    </div>
  </section>
</template>
