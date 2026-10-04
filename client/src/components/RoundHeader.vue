<script setup>
import { isHttpUrl, roundTitle } from '../lib/constants.js';

defineProps({ round: Object });
</script>

<template>
  <div class="round-head">
    <h2>
      {{ roundTitle(round) }}
      <span class="chip">Round {{ round.number }} · attempt {{ round.attempt }}</span>
    </h2>
    <a v-if="isHttpUrl(round.link)" :href="round.link" target="_blank" rel="noopener noreferrer">Open story ↗</a>
  </div>
</template>
