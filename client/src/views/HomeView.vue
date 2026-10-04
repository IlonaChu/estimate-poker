<script setup>
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { API_URL } from '../lib/api.js';
import { keysWithPrefix, load, remove, save } from '../lib/storage.js';
import { toast } from '../lib/toast.js';

const router = useRouter();
const name = ref(load('rp:hostName') ?? '');
const busy = ref(false);
const past = ref([]);

function refreshPast() {
  past.value = keysWithPrefix('rp:host:')
    .map((key) => ({ key, ...load(key) }))
    .filter((s) => s.id)
    .sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0));
}
onMounted(refreshPast);

async function create() {
  if (busy.value) return;
  busy.value = true;
  try {
    const res = await fetch(`${API_URL}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hostName: name.value }),
    });
    const body = await res.json();
    if (!res.ok) return toast(body.error || 'Could not create the session');
    save('rp:hostName', name.value.trim());
    save(`rp:host:${body.id}`, { id: body.id, hostToken: body.hostToken, hostName: name.value.trim(), snapshot: null, rounds: [], status: 'lobby', savedAt: Date.now() });
    router.push(`/s/${body.id}`);
  } catch {
    toast('Could not reach the server');
  } finally {
    busy.value = false;
  }
}

function forget(entry) {
  if (!window.confirm('Remove this session from this browser? Participants are not affected.')) return;
  remove(entry.key);
  refreshPast();
}

const when = (ts) => (ts ? new Date(ts).toLocaleString() : '');
</script>

<template>
  <section class="card narrow">
    <h1>Run a refinement session</h1>
    <p class="muted">One link for the whole session. Start as many rounds as you need, then finish and share the summary.</p>
    <form class="stack" @submit.prevent="create">
      <label>
        Your name (PO)
        <input v-model="name" maxlength="40" required autocomplete="name" placeholder="e.g. Pat" />
      </label>
      <button class="primary" :disabled="busy || !name.trim()">Create session</button>
    </form>
    <p class="muted small">Joining as a participant? Open the link your PO sent you.</p>
  </section>

  <section v-if="past.length" class="card narrow">
    <h2>My sessions in this browser</h2>
    <ul class="plain">
      <li v-for="s in past" :key="s.id" class="row between">
        <router-link :to="`/s/${s.id}`">
          Session {{ s.id }} · {{ s.status }} · {{ s.rounds?.length ?? 0 }} round(s)
          <span class="muted small">{{ when(s.savedAt) }}</span>
        </router-link>
        <button class="ghost small" @click="forget(s)">Remove</button>
      </li>
    </ul>
  </section>
</template>
