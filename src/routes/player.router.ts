import { Elysia, t } from 'elysia';
import { db } from '../db';
import { players, playerInvitations, user, teamPlayers } from '../database/schema';
import { ilike, or, and, eq, isNull, inArray } from 'drizzle-orm';
import {
  createPlayer,
  getPlayerById,
  getPlayersByTeam,
  getAllPlayers,
  getPlayersBySeason,
  getPlayerSeasons,
  updatePlayer,
  uploadPlayerImage,
  deletePlayer
} from '../services/players/player.service';
import { auth } from '../plugins/auth/auth';

export const playerRouter = new Elysia({ prefix: '/api/players' })
  .get('/search', async ({ query }) => {
    const q = String((query as any)?.q || '').trim();
    if (!q) return [];
    const teamId = (query as any)?.teamId as string | undefined;
    const seasonId = (query as any)?.seasonId as string | undefined;
    const pattern = `%${q}%`;
    const onlyUnlinked = String((query as any)?.onlyUnlinked || '').toLowerCase() === 'true';

    if (teamId && seasonId) {
      const rows = await db
        .select({
          id: players.id,
          nickname: players.nickname,
          firstName: players.firstName,
          lastName: players.lastName,
          email: players.email,
          shirtSize: players.shirtSize,
        })
        .from(players)
        // Exclude players already assigned for this team-season
        .leftJoin(teamPlayers, and(
          eq(teamPlayers.teamId, teamId),
          eq(teamPlayers.playerId, players.id),
          eq(teamPlayers.seasonId, seasonId)
        ))
        .where(and(
          or(
            ilike(players.firstName, pattern),
            ilike(players.lastName, pattern),
            ilike(players.nickname, pattern),
            ilike(players.email, pattern),
          ),
          isNull(teamPlayers.id)
        ));
      return rows;
    }

    const rows = await db
      .select({
        id: players.id,
        nickname: players.nickname,
        firstName: players.firstName,
        lastName: players.lastName,
        email: players.email,
        shirtSize: players.shirtSize,
        userId: players.userId,
      })
      .from(players)
      .where(and(
        or(
          ilike(players.firstName, pattern),
          ilike(players.lastName, pattern),
          ilike(players.nickname, pattern),
          ilike(players.email, pattern),
        ),
        onlyUnlinked ? isNull(players.userId) : undefined as any
      ));
    return rows;
  }, {
    query: t.Object({ q: t.Optional(t.String()), teamId: t.Optional(t.String()), seasonId: t.Optional(t.String()), onlyUnlinked: t.Optional(t.String()) }),
    detail: { summary: 'Search players by name/nickname/email', tags: ['Players'] }
  })

  // Check if an email already exists either on players or users
  .get('/check-email', async ({ query }) => {
    const email = String((query as any)?.email || '').trim();
    if (!email) return { existsInPlayers: false, existsInUsers: false };
    const pl = await db.select().from(players).where(eq(players.email, email));
    const us = await db.select().from(user).where(eq(user.email, email));
    return { existsInPlayers: (pl as any[]).length > 0, existsInUsers: (us as any[]).length > 0 };
  }, {
    query: t.Object({ email: t.String() }),
    detail: { summary: 'Check if email exists in players or users', tags: ['Players'] }
  })
  .get('/', async ({ query }) => {
    const seasonId = (query as any)?.seasonId as string | undefined;
    const rows = seasonId ? await getPlayersBySeason(seasonId) : await getAllPlayers();
    // Attach invitation metadata (pending + lastSentAt)
    try {
      const ids = (rows as any[]).map(r => r.id).filter(Boolean);
      if (ids.length > 0) {
        const invites = await db.select().from(playerInvitations).where(inArray(playerInvitations.playerId, ids as string[]));
        const latestByPlayer = new Map<string, any>();
        for (const inv of invites as any[]) {
          const key = inv.playerId as string;
          const prev = latestByPlayer.get(key);
          const prevDate = prev ? new Date(prev.updatedAt || prev.createdAt || 0).getTime() : -1;
          const curDate = new Date(inv.updatedAt || inv.createdAt || 0).getTime();
          if (!prev || curDate > prevDate) latestByPlayer.set(key, inv);
        }
        return (rows as any[]).map(r => {
          const li = latestByPlayer.get(r.id as string);
          const lastSentAt = li ? (li.updatedAt || li.createdAt || null) : null;
          const pending = li ? ((li.status || 'pending') === 'pending') : false;
          return { ...r, invitation: { pending, lastSentAt } };
        });
      }
    } catch {}
    return rows;
  }, {
    detail: {
      summary: 'List players (optionally by season)',
      tags: ['Players']
    }
  })
  .get('/team/:teamId', async ({ params }) => {
    return await getPlayersByTeam(params.teamId);
  }, {
    params: t.Object({
      teamId: t.String()
    }),
    detail: {
      summary: 'Get all players in a team',
      tags: ['Players']
    }
  })

  // Send or resend a player invite via Better Auth magic link flow
  .post('/:id/invite', async ({ params, set }) => {
    try {
      const [p] = await db.select().from(players).where(eq(players.id, params.id));
      if (!p) { set.status = 404; return { error: true, message: 'Player not found' }; }
      if (!p.email) { set.status = 400; return { error: true, message: 'Player email is required to send invite' }; }

      // Create or refresh invitation row
      const token = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);
      // Upsert by playerId/email: mark previous as pending and overwrite token & dates
      const existing = await db.select().from(playerInvitations).where(eq(playerInvitations.playerId, p.id));
      if (existing?.[0]) {
        await db.update(playerInvitations)
          .set({ email: p.email, token, expiresAt, status: 'pending', updatedAt: new Date() })
          .where(eq(playerInvitations.id, existing[0].id));
      } else {
        await db.insert(playerInvitations)
          .values({ playerId: p.id, email: p.email, token, expiresAt, status: 'pending' });
      }

      // Trigger Better Auth magic-link email to p.email with callback carrying invite token
      const backendUrl = process.env.BACKEND_PUBLIC_URL || `http://localhost:${process.env.BACKEND_PORT || 3000}`;
      const callbackURL = `${backendUrl}/api/players/link-invite?token=${encodeURIComponent(token)}`;
      await fetch(`${backendUrl}/api/auth/sign-in/magic-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: p.email, callbackURL })
      });
      return { success: true };
    } catch (e) {
      set.status = 500; return { error: true, message: 'Failed to send invite' };
    }
  }, {
    params: t.Object({ id: t.String() }),
    detail: { summary: 'Send or resend player invite', tags: ['Players'] }
  })

  .get('/:id', async ({ params }) => {
    const player = await getPlayerById(params.id);
    const seasons = await getPlayerSeasons(params.id);
    return { ...player, seasons };
  }, {
    params: t.Object({
      id: t.String()
    }),
    detail: {
      summary: 'Get player by ID',
      tags: ['Players']
    }
  })

  .post('/', async ({ body }) => {
    return await createPlayer({
      ...body,
      birthDate: body.birthDate ? new Date(body.birthDate) : undefined
    });
  }, {
    body: t.Object({
      nickname: t.String(),
      firstName: t.Optional(t.String()),
      lastName: t.Optional(t.String()),
      email: t.Optional(t.String()),
      teamId: t.Optional(t.String()),
      birthDate: t.Optional(t.String()),
      shirtSize: t.Optional(t.String()),
    }),
    detail: {
      summary: 'Create a new player',
      tags: ['Players']
    }
  })

  .put('/:id', async ({ params, body }) => {
    return await updatePlayer(params.id, {
      ...body,
      birthDate: body.birthDate ? new Date(body.birthDate) : undefined
    });
  }, {
    params: t.Object({
      id: t.String()
    }),
    body: t.Object({
      nickname: t.Optional(t.String()),
      firstName: t.Optional(t.String()),
      lastName: t.Optional(t.String()),
      email: t.Optional(t.String()),
      teamId: t.Optional(t.String()),
      birthDate: t.Optional(t.String()),
      shirtSize: t.Optional(t.String()),
    }),
    detail: {
      summary: 'Update a player',
      tags: ['Players']
    }
  })

  .post('/:id/image', async ({ params, body }) => {
    if (!body.file || !(body.file instanceof File)) {
      throw new Error('No file provided');
    }

    return await uploadPlayerImage(params.id, body.file);
  }, {
    params: t.Object({
      id: t.String()
    }),
    body: t.Object({
      file: t.Any()
    }),
    detail: {
      summary: 'Upload player image',
      tags: ['Players']
    }
  })

  .delete('/:id', async ({ params }) => {
    return await deletePlayer(params.id);
  }, {
    params: t.Object({
      id: t.String()
    }),
    detail: {
      summary: 'Delete a player',
      tags: ['Players']
    }
  })
  // Accept player invite and link user to player
  .post('/link-invite', async ({ request, body, set }) => {
    try {
      const token = (body as any)?.token as string;
      if (!token) {
        set.status = 400;
        return { error: true, message: 'Missing token' };
      }
      const [invite] = await db.select().from(playerInvitations).where(eq(playerInvitations.token, token));
      if (!invite) {
        set.status = 400;
        return { error: true, message: 'Invalid token' };
      }
      if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
        set.status = 400;
        return { error: true, message: 'Token expired' };
      }
      // When using magic link, the user is already authenticated by Better Auth.
      // If user does not exist yet, Better Auth created it on verify. We only need to mark invite accepted.
      // Mark invitation accepted
      await db.update(playerInvitations).set({ status: 'accepted', updatedAt: new Date() }).where(eq(playerInvitations.id, invite.id));
      return { success: true };
    } catch (e) {
      set.status = 500;
      return { error: true, message: 'Internal error' };
    }
  }, {
    body: t.Object({ token: t.String() }),
    detail: { summary: 'Accept player invitation and link user', tags: ['Players'] },
    // Make route public (no auth guard)
    beforeHandle: ({}) => {}
  })
  .get('/link-invite', async ({ request, query, set }) => {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
    const backendUrl = process.env.BACKEND_PUBLIC_URL || `http://localhost:${process.env.BACKEND_PORT || 3000}`;
    try {
      const token = (query as any)?.token || (query as any)?.invite;
      if (!token) {
        set.status = 302;
        set.headers['Location'] = `${frontendUrl}/auth/link-player?result=error&reason=missing-token`;
        return;
      }
      // Require an active session here (this endpoint is the callbackURL from Better Auth magic link verify)
      const session = await auth.api.getSession({ headers: request.headers });
      if (!session) {
        set.status = 302;
        set.headers['Location'] = `${frontendUrl}/auth/link-player?result=error&reason=unauthorized`;
        return;
      }
      const [invite] = await db.select().from(playerInvitations).where(eq(playerInvitations.token, String(token)));
      if (!invite) {
        set.status = 302;
        set.headers['Location'] = `${frontendUrl}/auth/link-player?result=error&reason=invalid-token`;
        return;
      }
      if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
        set.status = 302;
        set.headers['Location'] = `${frontendUrl}/auth/link-player?result=error&reason=expired`;
        return;
      }
      // Link user to player
      await db.update(players).set({ userId: session.user.id }).where(eq(players.id, invite.playerId));
      // Enrich user profile from player record (nickname, full name)
      try {
        const [p] = await db.select().from(players).where(eq(players.id, invite.playerId));
        if (p) {
          const fullName = [p.firstName, p.lastName].filter(Boolean).join(' ').trim();
          await db.update(user)
            .set({
              nickname: (p.nickname ?? '').trim(),
              name: fullName || (p.nickname ?? ''),
            })
            .where(eq(user.id, session.user.id));
        }
      } catch {}
      await db.update(playerInvitations).set({ status: 'accepted', updatedAt: new Date() }).where(eq(playerInvitations.id, invite.id));
      // If leagueTeamId present in query (?lt=...), redirect to a targeted accept flow on FE with context
      const leagueTeamId = (query as any)?.lt as string | undefined;
      set.status = 302;
      set.headers['Location'] = leagueTeamId
        ? `${frontendUrl}/auth/set-password?invite=1&lt=${encodeURIComponent(leagueTeamId)}`
        : `${frontendUrl}/auth/set-password?invite=1`;
      return;
    } catch {
      set.status = 302;
      set.headers['Location'] = `${frontendUrl}/auth/link-player?result=error`;
      return;
    }
  }, {
    query: t.Object({ token: t.Optional(t.String()), invite: t.Optional(t.String()) }),
    detail: { summary: 'Accept invite via GET and redirect to FE', tags: ['Players'] }
  });