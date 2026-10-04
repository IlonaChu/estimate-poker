<script setup>
import { computed, ref } from 'vue';
import { useSessionStore } from '../stores/session.js';
import AnalysisBanner from './AnalysisBanner.vue';
import AttemptHistory from './AttemptHistory.vue';
import FinalForm from './FinalForm.vue';
import RoundHeader from './RoundHeader.vue';
import Summary from './Summary.vue';
import TeamBoard from './TeamBoard.vue';

const props = defineProps({ view: Object });
const store = useSessionStore();

const title = ref('');
const link = ref('');

const allVoted = computed(() => props.view.participants.length > 0 && props.view.participants.every((p) => p.hasVoted));
const votedCount = computed(() => props.view.participants.filter((p) => p.hasVoted).length);

async function startRound() {
  const res = await store.send('start_round', { title: title.value, link: link.value });
  if (res?.ok) {
    title.value = '';
    link.value = '';
  }
}

function finishSession() {
  if (window.confirm('Finish the session? Everyone will see the summary and no more rounds can be started.')) {
    store.send('finish');
  }
}
</script>

<template>
  <section v-if="view.status === 'lobby'" class="card">
    <h2>Start round {{ view.rounds.length + 1 }}</h2>
    <p class="muted">Story title and link are optional. Leave them empty if you discuss the story out loud.</p>
    <form class="stack" @submit.prevent="startRound">
      <label>
        Story title (optional)
        <input v-model="title" maxlength="200" placeholder="e.g. PROJ-123 Login with SSO" />
      </label>
      <label>
        Story link (optional)
        <input v-model="link" type="url" maxlength="500" placeholder="https://…" />
      </label>
      <button class="primary">▶ Start round</button>
    </form>
  </section>

  <template v-else-if="view.round">
    <section class="card">
      <RoundHeader :round="view.round" />

      <template v-if="view.status === 'voting'">
        <p>
          <strong>{{ votedCount }}/{{ view.participants.length }}</strong> voted
          <span v-if="allVoted" class="chip ok">✓ Everyone has voted</span>
        </p>
        <button class="primary" @click="store.send('reveal')">👁 Reveal votes</button>
      </template>

      <template v-else>
        <AnalysisBanner :view="view" />
        <div class="row">
          <button @click="store.send('revote')">🔄 Revote this round</button>
        </div>
      </template>
    </section>

    <TeamBoard :view="view" />

    <FinalForm v-if="view.status === 'revealed'" :view="view" />
    <div v-if="view.status === 'revealed'" class="row">
      <button class="primary" @click="store.send('next_round')">Next round →</button>
    </div>

    <AttemptHistory :view="view" />
  </template>

  <Summary v-if="view.rounds.length" :rounds="view.rounds" :host-name="view.hostName" compact />

  <div class="row end">
    <button class="danger" @click="finishSession">Finish session</button>
  </div>
</template>
