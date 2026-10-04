<script setup>
import { TEAMS, isHttpUrl, roundTitle } from '../lib/constants.js';
import { copyText, download, toCsv, toMarkdown } from '../lib/export.js';
import { toast } from '../lib/toast.js';

const props = defineProps({ rounds: { type: Array, default: () => [] }, hostName: String, compact: Boolean });

async function copyMarkdown() {
  toast((await copyText(toMarkdown(props.rounds, props.hostName))) ? 'Summary copied as Markdown' : 'Could not copy');
}
const downloadCsv = () => download('refinement-summary.csv', toCsv(props.rounds));
const consensusText = (r) => (r.consensus === null ? '—' : r.consensus ? '✓ yes' : '✗ no');
</script>

<template>
  <section class="card">
    <h2>{{ compact ? 'Results so far' : 'Session summary' }}</h2>
    <p v-if="!rounds.length" class="muted">No rounds were completed.</p>
    <div v-else class="table-wrap">
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
          <tr v-for="r in rounds" :key="r.number">
            <td>{{ r.number }}</td>
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
        </tbody>
      </table>
    </div>
    <div v-if="!compact && rounds.length" class="row">
      <button @click="copyMarkdown">Copy as Markdown</button>
      <button @click="downloadCsv">Download CSV</button>
    </div>
  </section>
</template>
