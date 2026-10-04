// Pure, framework-free session logic. Every mutator takes a session and returns a NEW session.
import { timingSafeEqual } from 'node:crypto';

export const TEAMS = ['frontend', 'mobile', 'backend', 'qa'];
export const FIBONACCI = [1, 2, 3, 5, 8, 13, 21];
export const CARDS = [...FIBONACCI, '?', '☕'];
export const STATUSES = ['lobby', 'voting', 'revealed', 'finished'];
export const LARGE_GAP_STEPS = 2;

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

const fail = (message) => {
  throw new ValidationError(message);
};
const isNumeric = (card) => FIBONACCI.includes(card);

// ---------- validation helpers ----------

function cleanText(value, label, { max, required = false }) {
  if (value === undefined || value === null || value === '') {
    if (required) fail(`${label} is required`);
    return '';
  }
  if (typeof value !== 'string') fail(`${label} must be text`);
  const text = value.replace(/\s+/g, ' ').trim();
  if (!text && required) fail(`${label} is required`);
  if (text.length > max) fail(`${label} is too long (max ${max} characters)`);
  return text;
}

function cleanLink(value) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string') fail('Link must be text');
  const text = value.trim();
  if (text.length > 500) fail('Link is too long');
  let url;
  try {
    url = new URL(text);
  } catch {
    fail('Link must be a valid URL');
  }
  if (!['http:', 'https:'].includes(url.protocol)) fail('Link must start with http:// or https://');
  return url.href;
}

function cleanId(value, label = 'participantId') {
  if (typeof value !== 'string' || !ID_RE.test(value)) fail(`Invalid ${label}`);
  return value;
}

// ---------- fibonacci / analysis ----------

export function fibDistance(a, b) {
  const i = FIBONACCI.indexOf(a);
  const j = FIBONACCI.indexOf(b);
  if (i < 0 || j < 0) return null;
  return Math.abs(i - j);
}

/**
 * Analyse one set of votes. Only numeric cards count; "?" and "☕" are ignored.
 * Every team estimates on its own, so disagreement is only judged within a team.
 */
export function analyze(votes, participants) {
  const entries = Object.entries(votes ?? {})
    .filter(([pid, card]) => participants[pid] && isNumeric(card))
    .map(([pid, card]) => ({ pid, card, team: participants[pid].team }));

  const teams = {};
  for (const team of TEAMS) {
    const mine = entries.filter((e) => e.team === team);
    if (!mine.length) {
      teams[team] = {
        count: 0, min: null, max: null, median: null, distance: null,
        differ: false, largeGap: false, suggested: null, lowestIds: [], highestIds: [],
      };
      continue;
    }
    const values = mine.map((e) => e.card).sort((a, b) => a - b);
    const min = values[0];
    const max = values[values.length - 1];
    const differ = min !== max;
    const distance = fibDistance(min, max);
    teams[team] = {
      count: values.length,
      min,
      max,
      median: values[Math.floor(values.length / 2)],
      distance,
      differ,
      largeGap: differ && distance >= LARGE_GAP_STEPS,
      suggested: differ ? null : min,
      lowestIds: differ ? mine.filter((e) => e.card === min).map((e) => e.pid) : [],
      highestIds: differ ? mine.filter((e) => e.card === max).map((e) => e.pid) : [],
    };
  }

  const stats = Object.values(teams);
  const differ = stats.some((t) => t.differ);
  return {
    numericCount: entries.length,
    differ,
    consensus: entries.length > 0 && !differ,
    largeGap: stats.some((t) => t.largeGap),
    lowestIds: stats.flatMap((t) => t.lowestIds),
    highestIds: stats.flatMap((t) => t.highestIds),
    teams,
  };
}

// ---------- auth ----------

export function isHost(session, token) {
  if (typeof token !== 'string' || !token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(session.hostToken);
  return a.length === b.length && timingSafeEqual(a, b);
}

function assertHost(session, token) {
  if (!isHost(session, token)) fail('Only the PO can do this');
}

function assertStatus(session, allowed, action) {
  if (!allowed.includes(session.status)) fail(`Cannot ${action} while the session is "${session.status}"`);
}

// ---------- mutators ----------

function next(session, now) {
  const copy = structuredClone(session);
  copy.updatedAt = now;
  return copy;
}

export function createSession({ id, hostToken, hostName, now = Date.now() }) {
  cleanId(id, 'session id');
  if (typeof hostToken !== 'string' || hostToken.length < 16) fail('Invalid host token');
  return {
    id,
    hostToken,
    hostName: cleanText(hostName, 'Name', { max: 40, required: true }),
    status: 'lobby',
    createdAt: now,
    updatedAt: now,
    participants: {},
    rounds: [],
    current: null,
  };
}

export function joinSession(session, { participantId, name, team }, now = Date.now()) {
  assertStatus(session, ['lobby', 'voting', 'revealed'], 'join');
  const id = cleanId(participantId);
  const existing = session.participants[id];
  const cleanedName = name === undefined && existing ? existing.name : cleanText(name, 'Name', { max: 40, required: true });
  const cleanedTeam = team === undefined && existing ? existing.team : team;
  if (!TEAMS.includes(cleanedTeam)) fail('Pick a team: frontend, mobile, backend or qa');
  if (!existing && Object.keys(session.participants).length >= 200) fail('Session is full');
  const s = next(session, now);
  s.participants[id] = { id, name: cleanedName, team: cleanedTeam };
  return s;
}

export function vote(session, participantId, card, now = Date.now()) {
  if (!session.participants[participantId]) fail('Join the session first');
  assertStatus(session, ['voting'], 'vote');
  if (card !== null && !CARDS.includes(card)) fail('Unknown card');
  const s = next(session, now);
  const round = s.rounds[s.current];
  if (card === null) delete round.votes[participantId];
  else round.votes[participantId] = card;
  return s;
}

export function startRound(session, token, { title, link } = {}, now = Date.now()) {
  assertHost(session, token);
  assertStatus(session, ['lobby'], 'start a round');
  const round = {
    number: session.rounds.length + 1,
    title: cleanText(title, 'Story title', { max: 200 }),
    link: cleanLink(link),
    attempt: 1,
    votes: {},
    analysis: null,
    final: null,
    history: [],
  };
  const s = next(session, now);
  s.rounds.push(round);
  s.current = s.rounds.length - 1;
  s.status = 'voting';
  return s;
}

export function reveal(session, token, now = Date.now()) {
  assertHost(session, token);
  assertStatus(session, ['voting'], 'reveal');
  const s = next(session, now);
  const round = s.rounds[s.current];
  round.analysis = analyze(round.votes, s.participants);
  s.status = 'revealed';
  return s;
}

export function revote(session, token, now = Date.now()) {
  assertHost(session, token);
  assertStatus(session, ['revealed'], 'revote');
  const s = next(session, now);
  const round = s.rounds[s.current];
  round.history.push({ attempt: round.attempt, votes: round.votes, analysis: round.analysis });
  round.attempt += 1;
  round.votes = {};
  round.analysis = null;
  round.final = null;
  s.status = 'voting';
  return s;
}

export function setFinal(session, token, { teams, total } = {}, now = Date.now()) {
  assertHost(session, token);
  assertStatus(session, ['revealed'], 'set the result');
  if (!teams || typeof teams !== 'object') fail('Provide a final estimate per team');
  const round = session.rounds[session.current];
  const finalTeams = {};
  for (const [team, value] of Object.entries(teams)) {
    if (!TEAMS.includes(team)) fail(`Unknown team "${team}"`);
    if (!isNumeric(value)) fail(`Final estimate for ${team} must be a Fibonacci number`);
    if (!round.analysis.teams[team].count) fail(`Team ${team} did not vote, so it gets no estimate`);
    finalTeams[team] = value;
  }
  if (!Object.keys(finalTeams).length) fail('Provide at least one team estimate');
  let finalTotal = total;
  if (finalTotal === undefined || finalTotal === null || finalTotal === '') {
    finalTotal = Object.values(finalTeams).reduce((a, b) => a + b, 0);
  }
  if (typeof finalTotal !== 'number' || !Number.isFinite(finalTotal) || finalTotal < 0 || finalTotal > 9999) {
    fail('Total must be a number between 0 and 9999');
  }
  const s = next(session, now);
  s.rounds[s.current].final = { teams: finalTeams, total: finalTotal };
  return s;
}

export function nextRound(session, token, now = Date.now()) {
  assertHost(session, token);
  assertStatus(session, ['revealed'], 'start the next round');
  const s = next(session, now);
  s.status = 'lobby';
  s.current = null;
  return s;
}

export function finish(session, token, now = Date.now()) {
  assertHost(session, token);
  if (session.status === 'finished') fail('Session is already finished');
  const s = next(session, now);
  if (s.status === 'voting') {
    const round = s.rounds[s.current];
    // A round that was never revealed has nothing to report.
    if (!round.history.length) s.rounds.splice(s.current, 1);
  }
  s.status = 'finished';
  s.current = null;
  return s;
}

// ---------- views ----------

/** Unique display names ("Sam #1", "Sam #2") when several participants share a name. */
function displayNames(session) {
  const list = Object.values(session.participants);
  const totals = {};
  for (const p of list) totals[p.name.toLowerCase()] = (totals[p.name.toLowerCase()] ?? 0) + 1;
  const seen = {};
  const names = {};
  for (const p of list) {
    const key = p.name.toLowerCase();
    seen[key] = (seen[key] ?? 0) + 1;
    names[p.id] = totals[key] > 1 ? `${p.name} #${seen[key]}` : p.name;
  }
  return names;
}

/** Every member's card per revealed attempt, so results can be inspected per person. */
function memberVotes(session, names, votes) {
  return Object.values(session.participants).map((p) => ({
    id: p.id,
    name: names[p.id],
    team: p.team,
    card: votes[p.id] ?? null,
  }));
}

function summarize(session) {
  const names = displayNames(session);
  return session.rounds
    .map((round) => {
      const attempts = round.history.length + (round.analysis ? 1 : 0);
      if (!attempts) return null;
      const last = round.analysis ?? round.history[round.history.length - 1].analysis;
      const revealed = [...round.history, ...(round.analysis ? [round] : [])];
      return {
        attemptDetails: revealed.map((a, i) => ({
          attempt: i + 1,
          consensus: a.analysis.consensus,
          members: memberVotes(session, names, a.votes),
        })),
        number: round.number,
        title: round.title,
        link: round.link,
        attempts,
        consensus: last ? last.consensus : null,
        final: round.final,
      };
    })
    .filter(Boolean);
}

/** Strips votes of a round that is still being voted on. Host-only; contains no hostToken. */
export function exportSnapshot(session) {
  const { hostToken: _omit, ...rest } = structuredClone(session);
  if (rest.status === 'voting' && rest.current !== null) rest.rounds[rest.current].votes = {};
  return rest;
}

/** Role-filtered state for one connection. Votes are never included before reveal. */
export function viewFor(session, { hostToken, participantId, online = new Set() } = {}) {
  const host = isHost(session, hostToken);
  const me = participantId ? session.participants[participantId] : null;
  const role = host ? 'host' : me ? 'participant' : 'guest';
  const round = session.current !== null ? session.rounds[session.current] : null;
  const live = round && (session.status === 'voting' || session.status === 'revealed');
  const revealed = session.status === 'revealed';

  const names = displayNames(session);
  const participants = Object.values(session.participants).map((p) => {
    return {
      id: p.id,
      name: p.name,
      displayName: names[p.id],
      team: p.team,
      online: online.has(p.id),
      hasVoted: Boolean(live && round.votes[p.id] !== undefined),
    };
  });

  const view = {
    id: session.id,
    hostName: session.hostName,
    status: session.status,
    role,
    me: me ? { id: me.id, name: me.name, team: me.team } : null,
    participants,
    round: live
      ? {
          number: round.number,
          title: round.title,
          link: round.link,
          attempt: round.attempt,
          revealed,
          votes: revealed ? { ...round.votes } : null,
          analysis: revealed ? round.analysis : null,
          final: round.final,
          history: round.history,
        }
      : null,
    myVote: live && me ? round.votes[me.id] ?? null : null,
    rounds: summarize(session),
  };
  if (host) view.snapshot = exportSnapshot(session);
  return view;
}

// ---------- restore from a host-held snapshot ----------

function cleanVotes(votes, participants) {
  const out = {};
  if (!votes || typeof votes !== 'object') return out;
  for (const [pid, card] of Object.entries(votes)) {
    if (participants[pid] && CARDS.includes(card)) out[pid] = card;
  }
  return out;
}

function cleanFinal(final) {
  if (!final || typeof final !== 'object') return null;
  const teams = {};
  for (const [team, value] of Object.entries(final.teams ?? {})) {
    if (TEAMS.includes(team) && isNumeric(value)) teams[team] = value;
  }
  const total = Number.isFinite(final.total) && final.total >= 0 && final.total <= 9999 ? final.total : null;
  if (!Object.keys(teams).length && total === null) return null;
  return { teams, total: total ?? Object.values(teams).reduce((a, b) => a + b, 0) };
}

function safe(fn, fallback) {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

/** Rebuild a session from untrusted snapshot data; nothing is trusted, analysis is recomputed. */
export function restoreSession(snapshot, { id, hostToken, hostName, now = Date.now() }) {
  const snap = snapshot && typeof snapshot === 'object' ? snapshot : {};
  const session = createSession({ id, hostToken, hostName: snap.hostName ?? hostName ?? 'PO', now });
  if (Number.isFinite(snap.createdAt)) session.createdAt = snap.createdAt;

  for (const [pid, p] of Object.entries(snap.participants ?? {}).slice(0, 200)) {
    if (!ID_RE.test(pid) || !p || !TEAMS.includes(p.team)) continue;
    const name = safe(() => cleanText(p.name, 'Name', { max: 40, required: true }), null);
    if (name) session.participants[pid] = { id: pid, name, team: p.team };
  }

  const rawRounds = Array.isArray(snap.rounds) ? snap.rounds.slice(0, 500) : [];
  rawRounds.forEach((r, i) => {
    const raw = r && typeof r === 'object' ? r : {};
    const votes = cleanVotes(raw.votes, session.participants);
    session.rounds.push({
      number: i + 1,
      title: safe(() => cleanText(raw.title, 'Title', { max: 200 }), ''),
      link: safe(() => cleanLink(raw.link), ''),
      attempt: Number.isInteger(raw.attempt) && raw.attempt >= 1 && raw.attempt <= 1000 ? raw.attempt : 1,
      votes,
      analysis: raw.analysis ? analyze(votes, session.participants) : null,
      final: cleanFinal(raw.final),
      history: (Array.isArray(raw.history) ? raw.history.slice(0, 100) : []).map((h, n) => {
        const hv = cleanVotes(h?.votes, session.participants);
        return { attempt: n + 1, votes: hv, analysis: analyze(hv, session.participants) };
      }),
    });
  });

  const status = STATUSES.includes(snap.status) ? snap.status : 'lobby';
  const current = Number.isInteger(snap.current) && session.rounds[snap.current] ? snap.current : null;
  if ((status === 'voting' || status === 'revealed') && current !== null) {
    const round = session.rounds[current];
    if (status === 'revealed' && !round.analysis) round.analysis = analyze(round.votes, session.participants);
    if (status === 'voting') round.analysis = null;
    session.status = status;
    session.current = current;
  } else if (status === 'finished') {
    session.status = 'finished';
  }
  return session;
}
