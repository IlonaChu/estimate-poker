<script setup>
import { teamLabel } from '../lib/constants.js';
import { useSessionStore } from '../stores/session.js';
import AnalysisBanner from './AnalysisBanner.vue';
import AttemptHistory from './AttemptHistory.vue';
import RoundHeader from './RoundHeader.vue';
import Summary from './Summary.vue';
import TeamBoard from './TeamBoard.vue';
import VoteCards from './VoteCards.vue';

defineProps({ view: Object });
const store = useSessionStore();
</script>

<template>
  <p class="muted">
    You are <strong>{{ view.me.name }}</strong> · {{ teamLabel(view.me.team) }}
  </p>

  <section v-if="view.status === 'lobby'" class="card">
    <h2>Waiting for the PO to start the next round…</h2>
    <p class="muted">This page updates automatically. Keep it open for the whole session.</p>
  </section>

  <template v-else-if="view.round">
    <section class="card">
      <RoundHeader :round="view.round" />
      <VoteCards
        v-if="view.status === 'voting'"
        :selected="view.myVote"
        @pick="(card) => store.send('vote', { card })"
      />
      <AnalysisBanner v-else :view="view" />
    </section>
    <TeamBoard :view="view" />
    <AttemptHistory :view="view" />
  </template>

  <Summary v-if="view.rounds.length" :rounds="view.rounds" :host-name="view.hostName" compact />
</template>
