import { describe, expect, it } from 'vitest';
import {
  ValidationError, analyze, createSession, finish, fibDistance, joinSession, nextRound,
  restoreSession, reveal, revote, setFinal, startRound, viewFor, vote,
} from '../src/logic.js';

const TOKEN = 'host-token-0123456789abcdef';

function setup() {
  let s = createSession({ id: 'sess1', hostToken: TOKEN, hostName: 'Pat' });
  const people = [['fe', 'Anna', 'frontend'], ['mo', 'Bo', 'mobile'], ['be', 'Cy', 'backend'], ['qa', 'Di', 'qa']];
  for (const [participantId, name, team] of people) s = joinSession(s, { participantId, name, team });
  return s;
}

describe('fibDistance', () => {
  it('counts steps on the Fibonacci scale', () => {
    expect(fibDistance(3, 13)).toBe(3);
    expect(fibDistance(5, 8)).toBe(1);
    expect(fibDistance(5, 5)).toBe(0);
    expect(fibDistance(5, '?')).toBeNull();
  });
});

describe('state machine', () => {
  it('follows lobby -> voting -> revealed -> lobby -> finished', () => {
    let s = setup();
    expect(s.status).toBe('lobby');
    s = startRound(s, TOKEN, {});
    expect(s.status).toBe('voting');
    s = reveal(s, TOKEN);
    expect(s.status).toBe('revealed');
    s = nextRound(s, TOKEN);
    expect(s.status).toBe('lobby');
    s = finish(s, TOKEN);
    expect(s.status).toBe('finished');
  });

  it('rejects illegal transitions', () => {
    const s = setup();
    expect(() => reveal(s, TOKEN)).toThrow(ValidationError);
    expect(() => revote(s, TOKEN)).toThrow(ValidationError);
    expect(() => vote(s, 'fe', 5)).toThrow(ValidationError);
    const started = startRound(s, TOKEN, {});
    expect(() => startRound(started, TOKEN, {})).toThrow(ValidationError);
    expect(() => joinSession(finish(s, TOKEN), { participantId: 'x', name: 'X', team: 'qa' })).toThrow(ValidationError);
  });

  it('does not mutate the previous session object', () => {
    const s = setup();
    const started = startRound(s, TOKEN, {});
    expect(s.status).toBe('lobby');
    expect(s.rounds).toHaveLength(0);
    expect(started.rounds).toHaveLength(1);
  });
});

describe('host token enforcement', () => {
  it('rejects every host action with a wrong or missing token', () => {
    let s = setup();
    for (const bad of ['nope', '', undefined, null]) {
      expect(() => startRound(s, bad, {})).toThrow('Only the PO');
    }
    s = startRound(s, TOKEN, {});
    expect(() => reveal(s, 'wrong')).toThrow('Only the PO');
    s = reveal(s, TOKEN);
    expect(() => revote(s, 'wrong')).toThrow('Only the PO');
    expect(() => setFinal(s, 'wrong', { teams: {} })).toThrow('Only the PO');
    expect(() => nextRound(s, 'wrong')).toThrow('Only the PO');
    expect(() => finish(s, 'wrong')).toThrow('Only the PO');
  });

  it('only gives the snapshot to the host', () => {
    const s = setup();
    expect(viewFor(s, { hostToken: TOKEN }).snapshot).toBeDefined();
    expect(viewFor(s, { participantId: 'fe' }).snapshot).toBeUndefined();
    expect(JSON.stringify(viewFor(s, { hostToken: TOKEN }))).not.toContain(TOKEN);
  });
});

describe('hidden votes', () => {
  it('never exposes values before reveal, to anyone', () => {
    let s = startRound(setup(), TOKEN, { title: 'A' });
    s = vote(s, 'fe', 13);
    s = vote(s, 'be', 2);
    const host = viewFor(s, { hostToken: TOKEN });
    const other = viewFor(s, { participantId: 'mo' });
    const guest = viewFor(s, {});
    for (const view of [host, other, guest]) {
      expect(view.round.votes).toBeNull();
      expect(view.round.analysis).toBeNull();
      expect(view.participants.find((p) => p.id === 'fe').hasVoted).toBe(true);
      expect(view.participants.find((p) => p.id === 'mo').hasVoted).toBe(false);
    }
    expect(host.snapshot.rounds[0].votes).toEqual({});
    expect(viewFor(s, { participantId: 'fe' }).myVote).toBe(13);
    expect(other.myVote).toBeNull();
  });

  it('shows votes after reveal and lets a vote be cleared before it', () => {
    let s = startRound(setup(), TOKEN, {});
    s = vote(s, 'fe', 5);
    s = vote(s, 'fe', null);
    s = vote(s, 'be', 8);
    s = reveal(s, TOKEN);
    expect(viewFor(s, { participantId: 'mo' }).round.votes).toEqual({ be: 8 });
  });

  it('rejects unknown cards and unknown voters', () => {
    const s = startRound(setup(), TOKEN, {});
    expect(() => vote(s, 'fe', 4)).toThrow('Unknown card');
    expect(() => vote(s, 'ghost', 5)).toThrow('Join the session first');
  });
});

describe('analysis', () => {
  const participants = {
    a: { team: 'frontend' }, b: { team: 'frontend' }, c: { team: 'backend' }, d: { team: 'qa' }, e: { team: 'mobile' },
  };

  it('detects consensus', () => {
    const r = analyze({ a: 5, b: 5, c: 5 }, participants);
    expect(r.consensus).toBe(true);
    expect(r.differ).toBe(false);
    expect(r.lowestIds).toEqual([]);
  });

  it('flags differences, extremes and large gaps', () => {
    const r = analyze({ a: 3, b: 5, c: 13 }, participants);
    expect(r.differ).toBe(true);
    expect(r.min).toBe(3);
    expect(r.max).toBe(13);
    expect(r.distance).toBe(3);
    expect(r.largeGap).toBe(true);
    expect(r.lowestIds).toEqual(['a']);
    expect(r.highestIds).toEqual(['c']);
    expect(r.teams.frontend.differ).toBe(true);
    expect(r.teams.backend.suggested).toBe(13);
  });

  it('does not flag a one-step difference as a large gap', () => {
    const r = analyze({ a: 5, c: 8 }, participants);
    expect(r.differ).toBe(true);
    expect(r.largeGap).toBe(false);
  });

  it('ignores passes, "?" and non-voters', () => {
    const r = analyze({ a: 5, b: '☕', c: '?', d: 5 }, participants);
    expect(r.numericCount).toBe(2);
    expect(r.consensus).toBe(true);
    expect(r.teams.backend.count).toBe(0);
    expect(r.teams.mobile.count).toBe(0);
    expect(r.teams.frontend.count).toBe(1);
  });

  it('handles no numeric votes at all', () => {
    const r = analyze({ a: '?' }, participants);
    expect(r.numericCount).toBe(0);
    expect(r.differ).toBe(false);
    expect(r.consensus).toBe(false);
  });
});

describe('revote and results', () => {
  function revealedWithDifferences() {
    let s = startRound(setup(), TOKEN, { title: 'Story', link: 'https://jira.example.com/X-1' });
    s = vote(s, 'fe', 3);
    s = vote(s, 'mo', 13);
    s = vote(s, 'be', 5);
    return reveal(s, TOKEN);
  }

  it('keeps the earlier attempt in history and clears current votes', () => {
    let s = revealedWithDifferences();
    s = revote(s, TOKEN);
    expect(s.status).toBe('voting');
    const view = viewFor(s, { participantId: 'fe' });
    expect(view.round.attempt).toBe(2);
    expect(view.round.votes).toBeNull();
    expect(view.round.history).toHaveLength(1);
    expect(view.round.history[0].votes).toEqual({ fe: 3, mo: 13, be: 5 });
    expect(view.round.history[0].analysis.differ).toBe(true);
    expect(view.participants.every((p) => !p.hasVoted)).toBe(true);
  });

  it('sets per-team finals only for teams that voted', () => {
    let s = revealedWithDifferences();
    expect(() => setFinal(s, TOKEN, { teams: { qa: 5 } })).toThrow('did not vote');
    expect(() => setFinal(s, TOKEN, { teams: { frontend: 4 } })).toThrow('Fibonacci');
    expect(() => setFinal(s, TOKEN, { teams: {} })).toThrow('at least one');
    s = setFinal(s, TOKEN, { teams: { frontend: 5, backend: 5 } });
    expect(s.rounds[0].final).toEqual({ teams: { frontend: 5, backend: 5 }, total: 10 });
    s = setFinal(s, TOKEN, { teams: { frontend: 5, backend: 5 }, total: 11 });
    expect(s.rounds[0].final.total).toBe(11);
  });

  it('builds a summary with attempts and consensus', () => {
    let s = revealedWithDifferences();
    s = revote(s, TOKEN);
    s = vote(s, 'fe', 5);
    s = vote(s, 'be', 5);
    s = reveal(s, TOKEN);
    s = setFinal(s, TOKEN, { teams: { frontend: 5, backend: 5 } });
    s = finish(nextRound(s, TOKEN), TOKEN);
    const { rounds } = viewFor(s, {});
    expect(rounds).toHaveLength(1);
    expect(rounds[0]).toMatchObject({ number: 1, attempts: 2, consensus: true, title: 'Story' });
    expect(rounds[0].final.total).toBe(10);
  });

  it('drops a round that was never revealed when finishing', () => {
    const s = finish(startRound(setup(), TOKEN, {}), TOKEN);
    expect(viewFor(s, {}).rounds).toHaveLength(0);
  });
});

describe('input validation', () => {
  it('validates names, teams, links and titles', () => {
    const s = createSession({ id: 'sess2', hostToken: TOKEN, hostName: 'Pat' });
    expect(() => joinSession(s, { participantId: 'p', name: '  ', team: 'qa' })).toThrow('Name is required');
    expect(() => joinSession(s, { participantId: 'p', name: 'Al', team: 'design' })).toThrow('Pick a team');
    expect(() => joinSession(s, { participantId: 'bad id!', name: 'Al', team: 'qa' })).toThrow('Invalid');
    expect(() => startRound(s, TOKEN, { link: 'javascript:alert(1)' })).toThrow('http');
    expect(() => startRound(s, TOKEN, { link: 'not a url' })).toThrow('valid URL');
    expect(() => startRound(s, TOKEN, { title: 'x'.repeat(201) })).toThrow('too long');
    expect(startRound(s, TOKEN, {}).rounds[0].title).toBe('');
  });

  it('disambiguates duplicate names', () => {
    let s = createSession({ id: 'sess3', hostToken: TOKEN, hostName: 'Pat' });
    s = joinSession(s, { participantId: 'a', name: 'Sam', team: 'qa' });
    s = joinSession(s, { participantId: 'b', name: 'sam', team: 'mobile' });
    const names = viewFor(s, {}).participants.map((p) => p.displayName);
    expect(names).toEqual(['Sam #1', 'sam #2']);
  });

  it('lets a returning participant resume without re-sending name and team', () => {
    let s = createSession({ id: 'sess4', hostToken: TOKEN, hostName: 'Pat' });
    s = joinSession(s, { participantId: 'a', name: 'Sam', team: 'qa' });
    s = joinSession(s, { participantId: 'a' });
    expect(s.participants.a).toMatchObject({ name: 'Sam', team: 'qa' });
  });
});

describe('restoreSession', () => {
  it('round-trips a host snapshot under the same id', () => {
    let s = startRound(setup(), TOKEN, { title: 'Story' });
    s = vote(s, 'fe', 5);
    s = reveal(s, TOKEN);
    s = setFinal(s, TOKEN, { teams: { frontend: 5 } });
    const snapshot = JSON.parse(JSON.stringify(viewFor(s, { hostToken: TOKEN }).snapshot));
    const restored = restoreSession(snapshot, { id: 'sess1', hostToken: TOKEN });
    expect(restored.id).toBe('sess1');
    expect(restored.status).toBe('revealed');
    expect(Object.keys(restored.participants)).toHaveLength(4);
    expect(restored.rounds[0].final.total).toBe(5);
    expect(viewFor(restored, { participantId: 'fe' }).round.votes).toEqual({ fe: 5 });
  });

  it('restores an in-progress voting round with hidden votes dropped', () => {
    let s = startRound(setup(), TOKEN, {});
    s = vote(s, 'fe', 5);
    const restored = restoreSession(viewFor(s, { hostToken: TOKEN }).snapshot, { id: 'sess1', hostToken: TOKEN });
    expect(restored.status).toBe('voting');
    expect(restored.rounds[0].votes).toEqual({});
  });

  it('sanitizes garbage and requires a real token', () => {
    expect(() => restoreSession({}, { id: 'abc', hostToken: 'short' })).toThrow('Invalid host token');
    const r = restoreSession(
      { status: 'revealed', current: 7, participants: { '../x': { name: 'Z', team: 'qa' }, ok: { name: 'Ok', team: 'x' } }, rounds: [null, 5] },
      { id: 'abc', hostToken: TOKEN, hostName: 'Pat' },
    );
    expect(r.status).toBe('lobby');
    expect(r.participants).toEqual({});
    expect(r.rounds).toHaveLength(2);
  });
});
