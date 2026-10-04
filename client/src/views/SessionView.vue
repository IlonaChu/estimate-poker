<script setup>
import { computed, onBeforeUnmount, watch } from 'vue';
import { useRoute } from 'vue-router';
import HostPanel from '../components/HostPanel.vue';
import JoinForm from '../components/JoinForm.vue';
import ParticipantPanel from '../components/ParticipantPanel.vue';
import SessionHeader from '../components/SessionHeader.vue';
import Summary from '../components/Summary.vue';
import { useSessionStore } from '../stores/session.js';

const route = useRoute();
const store = useSessionStore();

watch(() => route.params.id, (id) => store.start(id), { immediate: true });
onBeforeUnmount(() => store.stop());

const local = computed(() => (store.phase === 'notfound' ? store.hostData() : null));
const localFinished = computed(() => local.value?.status === 'finished');
</script>

<template>
  <p v-if="store.phase === 'connecting'" class="muted">Connecting…</p>

  <section v-else-if="store.phase === 'notfound'" class="card narrow">
    <template v-if="local">
      <template v-if="localFinished">
        <h1>Session summary</h1>
        <p class="muted">This session has finished and is no longer on the server. Showing the copy saved in this browser.</p>
        <Summary :rounds="local.rounds ?? []" :host-name="local.hostName" />
      </template>
      <template v-else>
        <h1>Session not found on the server</h1>
        <p>The server probably restarted. Your browser has a backup of this session, so you can bring it back <strong>under the same link</strong>. Participants will reconnect automatically.</p>
        <button class="primary" @click="store.restore()">Restore session</button>
      </template>
    </template>
    <template v-else>
      <h1>Session not found</h1>
      <p class="muted">Check the link, or wait: if the server was restarted your PO can restore the session. Retrying automatically…</p>
    </template>
  </section>

  <template v-else-if="store.view">
    <SessionHeader :view="store.view" :connected="store.connected" />
    <Summary v-if="store.view.status === 'finished'" :rounds="store.view.rounds" :host-name="store.view.hostName" />
    <HostPanel v-else-if="store.view.role === 'host'" :view="store.view" />
    <ParticipantPanel v-else-if="store.view.role === 'participant'" :view="store.view" />
    <JoinForm v-else />
  </template>
</template>
