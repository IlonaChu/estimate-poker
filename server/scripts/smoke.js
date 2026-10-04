// End-to-end smoke test: spawns the real server and drives it with socket.io-client.
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { io } from 'socket.io-client';

const PORT = 3999;
const BASE = `http://localhost:${PORT}`;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = spawn('node', ['src/index.js'], { cwd: root, env: { ...process.env, PORT: String(PORT) }, stdio: 'inherit' });
let passed = 0;
const check = (label, fn) => {
  fn();
  passed += 1;
  console.log(`  ok  ${label}`);
};

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${BASE}/api/health`)).ok) return;
    } catch { /* not up yet */ }
    await sleep(100);
  }
  throw new Error('Server did not start');
}

function client() {
  const socket = io(BASE, { transports: ['websocket'] });
  const c = {
    socket,
    state: null,
    emit: (event, payload = {}) => new Promise((resolve) => socket.emit(event, payload, resolve)),
    hello: (payload) => new Promise((resolve) => socket.emit('hello', payload, (res) => {
      if (res.ok) c.state = res.view;
      resolve(res);
    })),
  };
  socket.on('state', (view) => { c.state = view; });
  return c;
}

async function main() {
  await waitForServer();
  console.log('Smoke test');

  const created = await (await fetch(`${BASE}/api/sessions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hostName: 'Pat' }),
  })).json();
  const sessionId = created.id;
  const hostToken = created.hostToken;

  const host = client();
  await host.hello({ sessionId, hostToken });
  check('host recognised as host', () => assert.equal(host.state.role, 'host'));

  const teams = ['frontend', 'mobile', 'backend', 'qa'];
  const people = [];
  for (const team of teams) {
    const p = client();
    const participantId = `p-${team}`;
    await p.hello({ sessionId, participantId });
    check(`${team} visitor starts as guest`, () => assert.equal(p.state.role, 'guest'));
    const res = await p.emit('join', { participantId, name: `User ${team}`, team });
    assert.ok(res.ok, res.error);
    people.push({ ...p, team, participantId, c: p });
  }
  const byTeam = Object.fromEntries(people.map((p) => [p.team, p.c]));
  await sleep(100);
  check('host sees 4 participants', () => assert.equal(host.state.participants.length, 4));

  const attacker = byTeam.qa;
  const denied = await attacker.emit('start_round', { title: 'hack' });
  check('participant start_round is rejected', () => assert.equal(denied.ok, false));

  // ---- Round 1: differing votes ----
  assert.ok((await host.emit('start_round', { title: 'Story A', link: 'https://jira.example.com/A-1' })).ok);
  await byTeam.frontend.emit('vote', { card: 3 });
  await byTeam.mobile.emit('vote', { card: 8 });
  await byTeam.backend.emit('vote', { card: 13 });
  await byTeam.qa.emit('vote', { card: 5 });
  await sleep(100);
  check('votes hidden from host before reveal', () => {
    assert.equal(host.state.round.votes, null);
    assert.equal(host.state.round.analysis, null);
    assert.ok(host.state.participants.every((p) => p.hasVoted));
  });
  check('votes hidden from other participants before reveal', () => {
    assert.equal(byTeam.mobile.state.round.votes, null);
    assert.equal(byTeam.mobile.state.myVote, 8);
    assert.ok(!JSON.stringify(byTeam.mobile.state).includes('"13"'));
  });

  assert.ok((await host.emit('reveal')).ok);
  await sleep(100);
  check('reveal flags differences, extremes and large gap', () => {
    const a = byTeam.qa.state.round.analysis;
    assert.equal(a.differ, true);
    assert.equal(a.min, 3);
    assert.equal(a.max, 13);
    assert.equal(a.distance, 3);
    assert.equal(a.largeGap, true);
    assert.deepEqual(a.lowestIds, ['p-frontend']);
    assert.deepEqual(a.highestIds, ['p-backend']);
    assert.equal(byTeam.qa.state.round.votes['p-backend'], 13);
  });

  // ---- Revote ----
  assert.ok((await host.emit('revote')).ok);
  await sleep(100);
  check('revote returns to voting, keeps history, clears votes', () => {
    assert.equal(host.state.status, 'voting');
    assert.equal(host.state.round.attempt, 2);
    assert.equal(host.state.round.history.length, 1);
    assert.ok(host.state.participants.every((p) => !p.hasVoted));
    assert.equal(byTeam.frontend.state.myVote, null);
  });
  for (const team of teams) await byTeam[team].emit('vote', { card: 5 });
  assert.ok((await host.emit('reveal')).ok);
  await sleep(100);
  check('consensus after revote', () => assert.equal(host.state.round.analysis.consensus, true));
  assert.ok((await host.emit('set_final', { teams: { frontend: 5, mobile: 5, backend: 5, qa: 5 }, total: 20 })).ok);
  assert.ok((await host.emit('next_round')).ok);
  await sleep(100);
  check('next round returns to lobby, same link', () => {
    assert.equal(host.state.status, 'lobby');
    assert.equal(host.state.round, null);
    assert.equal(byTeam.qa.state.id, sessionId);
  });

  // ---- Round 2: qa does not vote ----
  assert.ok((await host.emit('start_round', {})).ok);
  await byTeam.frontend.emit('vote', { card: 8 });
  await byTeam.mobile.emit('vote', { card: '☕' });
  await byTeam.backend.emit('vote', { card: 8 });
  assert.ok((await host.emit('reveal')).ok);
  await sleep(100);
  check('non-voting team and pass are ignored', () => {
    const a = host.state.round.analysis;
    assert.equal(a.numericCount, 2);
    assert.equal(a.consensus, true);
    assert.equal(a.teams.qa.count, 0);
    assert.equal(a.teams.mobile.count, 0);
  });
  const bad = await host.emit('set_final', { teams: { qa: 5 } });
  check('final for a non-voting team is rejected', () => assert.equal(bad.ok, false));
  assert.ok((await host.emit('set_final', { teams: { frontend: 8, backend: 8 } })).ok);
  assert.ok((await host.emit('next_round')).ok);

  // ---- Finish ----
  assert.ok((await host.emit('finish')).ok);
  await sleep(100);
  check('summary visible to participants after finish', () => {
    const s = byTeam.qa.state;
    assert.equal(s.status, 'finished');
    assert.equal(s.rounds.length, 2);
    assert.equal(s.rounds[0].attempts, 2);
    assert.equal(s.rounds[0].final.total, 20);
    assert.equal(s.rounds[1].attempts, 1);
    assert.equal(s.rounds[1].final.total, 16);
    assert.ok(s.rounds.every((r) => r.consensus === true));
  });

  // ---- Restore after server loss ----
  const snapshot = host.state.snapshot;
  const unknown = 'restoredSess1';
  const restoreRes = await fetch(`${BASE}/api/sessions/${unknown}/restore`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hostToken, hostName: 'Pat', snapshot }),
  });
  check('restore recreates a session under a chosen id', () => assert.equal(restoreRes.status, 201));
  const again = client();
  const res = await again.hello({ sessionId: unknown, hostToken });
  check('restored session is usable by its host with its summary', () => {
    assert.ok(res.ok);
    assert.equal(again.state.role, 'host');
    assert.equal(again.state.rounds.length, 2);
  });

  console.log(`\nAll ${passed} checks passed`);
}

main()
  .then(() => { server.kill(); process.exit(0); })
  .catch((err) => { console.error('\nSMOKE TEST FAILED:', err); server.kill(); process.exit(1); });
