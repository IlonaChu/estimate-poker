import { defineStore } from 'pinia';
import { io } from 'socket.io-client';
import { ref } from 'vue';
import { load, randomId, save } from '../lib/storage.js';
import { API_URL } from '../lib/api.js';
import { toast } from '../lib/toast.js';

export const useSessionStore = defineStore('session', () => {
  const view = ref(null);
  const phase = ref('connecting'); // connecting | ready | notfound
  const connected = ref(false);
  const sessionId = ref('');

  let socket = null;
  let retryTimer = null;
  let generation = 0;

  const meKey = () => `rp:me:${sessionId.value}`;
  const hostKey = () => `rp:host:${sessionId.value}`;
  const hostData = () => load(hostKey());

  function setView(next) {
    view.value = next;
    if (next.role === 'host' && next.snapshot) {
      const existing = hostData();
      if (existing?.hostToken) {
        save(hostKey(), { ...existing, snapshot: next.snapshot, rounds: next.rounds, status: next.status, savedAt: Date.now() });
      }
    }
  }

  function hello() {
    const gen = generation;
    clearTimeout(retryTimer);
    socket.emit(
      'hello',
      { sessionId: sessionId.value, participantId: load(meKey())?.participantId, hostToken: hostData()?.hostToken },
      (res) => {
        if (gen !== generation) return;
        if (res?.ok) {
          phase.value = 'ready';
          setView(res.view);
        } else {
          phase.value = 'notfound';
          view.value = null;
          retryTimer = setTimeout(() => socket?.connected && hello(), 4000);
        }
      },
    );
  }

  function start(id) {
    stop();
    sessionId.value = id;
    phase.value = 'connecting';
    socket = io(API_URL || undefined);
    socket.on('connect', () => {
      connected.value = true;
      hello();
    });
    socket.on('disconnect', () => {
      connected.value = false;
    });
    socket.on('state', (next) => {
      phase.value = 'ready';
      setView(next);
    });
  }

  function stop() {
    generation += 1;
    clearTimeout(retryTimer);
    socket?.disconnect();
    socket = null;
    view.value = null;
    connected.value = false;
  }

  function send(event, payload = {}) {
    return new Promise((resolve) => {
      if (!socket?.connected) {
        toast('Not connected to the server');
        return resolve(null);
      }
      socket.emit(event, payload, (res) => {
        if (!res?.ok) toast(res?.error || 'Something went wrong');
        resolve(res);
      });
    });
  }

  async function join(name, team) {
    const participantId = load(meKey())?.participantId || randomId();
    const res = await send('join', { participantId, name, team });
    if (res?.ok) save(meKey(), { participantId, name, team });
    return res;
  }

  async function restore() {
    const data = hostData();
    if (!data?.hostToken) return;
    try {
      const res = await fetch(`${API_URL}/api/sessions/${sessionId.value}/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken: data.hostToken, hostName: data.hostName, snapshot: data.snapshot }),
      });
      if (!res.ok) return toast((await res.json().catch(() => ({}))).error || 'Could not restore the session');
      hello();
    } catch {
      toast('Could not reach the server');
    }
  }

  return { view, phase, connected, sessionId, start, stop, send, join, restore, hostData, meKey };
});
