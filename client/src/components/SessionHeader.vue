<script setup>
import { copyText } from '../lib/export.js';
import { toast } from '../lib/toast.js';

const props = defineProps({ view: Object, connected: Boolean });

const STATUS_LABEL = {
  lobby: 'Waiting for next round',
  voting: 'Voting',
  revealed: 'Votes revealed',
  finished: 'Finished',
};

async function copyLink() {
  const link = `${window.location.origin}/s/${props.view.id}`;
  toast((await copyText(link)) ? 'Participant link copied' : `Copy this link: ${link}`);
}
</script>

<template>
  <div class="session-head">
    <div>
      <h1>Session by {{ view.hostName }}</h1>
      <p class="muted small">
        <span class="chip">{{ STATUS_LABEL[view.status] }}</span>
        {{ view.participants.length }} participant(s)
        <span v-if="!connected" class="chip warn">⚠ Reconnecting…</span>
      </p>
    </div>
    <button v-if="view.role === 'host'" class="primary" @click="copyLink">🔗 Copy participant link</button>
  </div>
</template>
