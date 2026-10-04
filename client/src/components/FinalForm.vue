<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { FIBONACCI, TEAMS } from '../lib/constants.js';
import { useSessionStore } from '../stores/session.js';

const props = defineProps({ view: Object });
const store = useSessionStore();

const round = computed(() => props.view.round);
const votingTeams = computed(() => TEAMS.filter((t) => round.value.analysis.teams[t.id].count > 0));
const silentTeams = computed(() => TEAMS.filter((t) => round.value.analysis.teams[t.id].count === 0));

const values = reactive({});
const totalInput = ref('');

function init() {
  for (const key of Object.keys(values)) delete values[key];
  for (const t of votingTeams.value) {
    values[t.id] = round.value.final?.teams?.[t.id] ?? round.value.analysis.teams[t.id].suggested ?? '';
  }
  totalInput.value = round.value.final ? String(round.value.final.total) : '';
}
watch(() => [round.value.number, round.value.attempt, round.value.analysis], init, { immediate: true });

const autoTotal = computed(() => Object.values(values).reduce((sum, v) => sum + (Number(v) || 0), 0));
const ready = computed(() => Object.values(values).some((v) => v !== ''));

function save() {
  const teams = {};
  for (const [id, v] of Object.entries(values)) if (v !== '') teams[id] = Number(v);
  store.send('set_final', { teams, total: totalInput.value === '' ? autoTotal.value : Number(totalInput.value) });
}
</script>

<template>
  <section class="card">
    <h3>Round result</h3>
    <p class="muted small">
      Final estimate per team that voted. Prefilled when a team agreed; pick a value where it did not.
      <span v-if="silentTeams.length">Not voting: {{ silentTeams.map((t) => t.label).join(', ') }}.</span>
    </p>
    <form class="stack" @submit.prevent="save">
      <div class="finals">
        <label v-for="t in votingTeams" :key="t.id">
          {{ t.label }}
          <select v-model="values[t.id]">
            <option value="">—</option>
            <option v-for="n in FIBONACCI" :key="n" :value="n">{{ n }}</option>
          </select>
        </label>
        <label>
          Total (optional override)
          <input v-model="totalInput" type="number" min="0" max="9999" :placeholder="String(autoTotal)" />
        </label>
      </div>
      <div class="row">
        <button class="primary" :disabled="!ready">💾 Save result</button>
        <span v-if="round.final" class="chip ok">Saved · total {{ round.final.total }}</span>
      </div>
    </form>
  </section>
</template>
