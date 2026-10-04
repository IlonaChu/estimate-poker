<script setup>
import { ref } from 'vue';
import { TEAMS } from '../lib/constants.js';
import { load } from '../lib/storage.js';
import { useSessionStore } from '../stores/session.js';

const store = useSessionStore();
const saved = load(store.meKey());
const name = ref(saved?.name ?? '');
const team = ref(saved?.team ?? '');
const busy = ref(false);

async function submit() {
  busy.value = true;
  await store.join(name.value, team.value);
  busy.value = false;
}
</script>

<template>
  <section class="card narrow">
    <h2>Join the session</h2>
    <form class="stack" @submit.prevent="submit">
      <label>
        Your name
        <input v-model="name" maxlength="40" required autocomplete="name" />
      </label>
      <fieldset>
        <legend>Your team</legend>
        <label v-for="t in TEAMS" :key="t.id" class="radio">
          <input v-model="team" type="radio" name="team" :value="t.id" required />
          {{ t.label }}
        </label>
      </fieldset>
      <button class="primary" :disabled="busy || !name.trim() || !team">Join</button>
    </form>
  </section>
</template>
