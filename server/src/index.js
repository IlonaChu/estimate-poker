import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { nanoid } from 'nanoid';
import { Server } from 'socket.io';
import {
  ValidationError, createSession, finish, isHost, joinSession, nextRound, restoreSession,
  reveal, revote, setFinal, startRound, viewFor, vote,
} from './logic.js';

const PORT = Number(process.env.PORT) || 3001;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');

const sessions = new Map();

const app = express();
// Allow a separately hosted client (e.g. GitHub Pages) when CORS_ORIGIN is set.
const CORS_ORIGIN = process.env.CORS_ORIGIN;
if (CORS_ORIGIN) {
  app.use((req, res, next) => {
    res.set({
      'Access-Control-Allow-Origin': CORS_ORIGIN,
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
}
app.use(express.json({ limit: '1mb' }));

const newHostToken = () => randomBytes(24).toString('hex');

app.get('/api/health', (_req, res) => res.json({ ok: true, sessions: sessions.size }));

app.post('/api/sessions', (req, res) => {
  try {
    const session = createSession({ id: nanoid(10), hostToken: newHostToken(), hostName: req.body?.hostName });
    sessions.set(session.id, session);
    res.status(201).json({ id: session.id, hostToken: session.hostToken });
  } catch (err) {
    sendError(res, err);
  }
});

// Recreate a session lost by a server restart from the PO's browser backup, under the SAME id.
app.post('/api/sessions/:id/restore', (req, res) => {
  try {
    const { hostToken, hostName, snapshot } = req.body ?? {};
    const existing = sessions.get(req.params.id);
    if (existing) {
      if (isHost(existing, hostToken)) return res.json({ ok: true, restored: false });
      return res.status(409).json({ error: 'A session with this id already exists' });
    }
    const session = restoreSession(snapshot, { id: req.params.id, hostToken, hostName });
    sessions.set(session.id, session);
    res.status(201).json({ ok: true, restored: true });
  } catch (err) {
    sendError(res, err);
  }
});

function sendError(res, err) {
  if (err instanceof ValidationError) return res.status(400).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Internal error' });
}

if (existsSync(dist)) {
  app.use(express.static(dist));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next();
    res.sendFile(path.join(dist, 'index.html'));
  });
}

const server = http.createServer(app);
const io = new Server(server, CORS_ORIGIN ? { cors: { origin: CORS_ORIGIN } } : undefined);

function onlineIds(sessionId) {
  const online = new Set();
  for (const sid of io.sockets.adapter.rooms.get(sessionId) ?? []) {
    const pid = io.sockets.sockets.get(sid)?.data.participantId;
    if (pid) online.add(pid);
  }
  return online;
}

function broadcast(sessionId) {
  const session = sessions.get(sessionId);
  const room = io.sockets.adapter.rooms.get(sessionId);
  if (!session || !room) return;
  const online = onlineIds(sessionId);
  for (const sid of room) {
    const sock = io.sockets.sockets.get(sid);
    if (!sock) continue;
    sock.emit('state', viewFor(session, { hostToken: sock.data.hostToken, participantId: sock.data.participantId, online }));
  }
}

io.on('connection', (socket) => {
  socket.data = { sessionId: null, hostToken: null, participantId: null };

  const reply = (ack, payload) => typeof ack === 'function' && ack(payload);

  socket.on('hello', (payload, ack) => {
    const session = sessions.get(payload?.sessionId);
    if (!session) return reply(ack, { ok: false, error: 'not_found' });
    socket.data = {
      sessionId: session.id,
      hostToken: typeof payload.hostToken === 'string' ? payload.hostToken : null,
      participantId: typeof payload.participantId === 'string' ? payload.participantId : null,
    };
    socket.join(session.id);
    const view = viewFor(session, { ...socket.data, online: onlineIds(session.id) });
    reply(ack, { ok: true, view });
    broadcast(session.id);
  });

  // Registers an intent: `apply(session, payload, ctx)` returns the next session or throws ValidationError.
  const intent = (event, apply) => {
    socket.on(event, (payload, ack) => {
      try {
        const { sessionId } = socket.data;
        const session = sessions.get(sessionId);
        if (!session) return reply(ack, { ok: false, error: 'Session not found' });
        const updated = apply(session, payload ?? {}, socket.data, socket);
        sessions.set(sessionId, updated);
        broadcast(sessionId);
        reply(ack, { ok: true });
      } catch (err) {
        if (err instanceof ValidationError) return reply(ack, { ok: false, error: err.message });
        console.error(err);
        reply(ack, { ok: false, error: 'Internal error' });
      }
    });
  };

  intent('join', (s, p, ctx) => {
    const updated = joinSession(s, { participantId: p.participantId, name: p.name, team: p.team });
    ctx.participantId = p.participantId;
    return updated;
  });
  intent('vote', (s, p, ctx) => vote(s, ctx.participantId, p.card ?? null));
  intent('start_round', (s, p, ctx) => startRound(s, ctx.hostToken, p));
  intent('reveal', (s, _p, ctx) => reveal(s, ctx.hostToken));
  intent('revote', (s, _p, ctx) => revote(s, ctx.hostToken));
  intent('set_final', (s, p, ctx) => setFinal(s, ctx.hostToken, p));
  intent('next_round', (s, _p, ctx) => nextRound(s, ctx.hostToken));
  intent('finish', (s, _p, ctx) => finish(s, ctx.hostToken));

  socket.on('disconnect', () => {
    if (socket.data.sessionId) broadcast(socket.data.sessionId);
  });
});

// Expire sessions idle for 24h (unless someone is still connected).
setInterval(() => {
  const cutoff = Date.now() - SESSION_TTL_MS;
  for (const [id, session] of sessions) {
    const connected = (io.sockets.adapter.rooms.get(id)?.size ?? 0) > 0;
    if (!connected && session.updatedAt < cutoff) sessions.delete(id);
  }
}, 10 * 60 * 1000).unref();

server.listen(PORT, () => console.log(`Refinement Poker server on http://localhost:${PORT}`));
