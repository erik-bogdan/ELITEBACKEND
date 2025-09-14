import { Elysia, t } from 'elysia';
import { db } from '../db';
import { leagues, leagueTeams, players, teamPlayers, teams, playerInvitations, user } from '../database/schema';
import { auth } from '../plugins/auth/auth';
import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { LoggingService } from '../services/logging.service';

export const applyRouter = new Elysia({ prefix: '/api/apply' })
  .get('/:leagueTeamId/meta', async ({ params, request, set }) => {
    try {
      const session = await auth.api.getSession({ headers: request.headers });
      if (!session) {
        set.status = 401;
        return { error: true, message: 'Unauthorized' };
      }

      const leagueTeamId = params.leagueTeamId;
      const [lt] = await db
        .select({
          id: leagueTeams.id,
          teamId: leagueTeams.teamId,
          leagueId: leagueTeams.leagueId,
          status: leagueTeams.status,
        })
        .from(leagueTeams)
        .where(eq(leagueTeams.id, leagueTeamId));
      if (!lt) {
        set.status = 404;
        return { error: true, message: 'League team not found' };
      }

      const [lg] = await db.select().from(leagues).where(eq(leagues.id, lt.leagueId));
      if (!lg) {
        set.status = 404;
        return { error: true, message: 'League not found' };
      }

      const [team] = await db.select().from(teams).where(eq(teams.id, lt.teamId));
      if (!team) {
        set.status = 404;
        return { error: true, message: 'Team not found' };
      }

      // Find player linked to current user
      const [me] = await db.select().from(players).where(eq(players.userId, session.user.id));
      if (!me) {
        set.status = 403;
        return { error: true, message: 'No player linked to this user' };
      }

      // Check captain in team_players for this team and league season
      const [tp] = await db
        .select()
        .from(teamPlayers)
        .where(and(
          eq(teamPlayers.teamId, lt.teamId),
          eq(teamPlayers.seasonId, lg.seasonId),
          eq(teamPlayers.playerId, me.id)
        ));

      if (!tp) {
        set.status = 403;
        return { error: true, message: 'Player is not assigned to this team for the league season' };
      }

      const isCaptain = !!tp.captain;
      if (!isCaptain) {
        set.status = 403;
        return { error: true, message: 'Not team captain for this team-season' };
      }

      return {
        teamId: lt.teamId,
        seasonId: lg.seasonId,
        teamName: team.name,
        isCaptain: true,
        status: lt.status,
      };
    } catch (e) {
      set.status = 500;
      return { error: true, message: e instanceof Error ? e.message : 'Internal error' };
    }
  }, {
    params: t.Object({ leagueTeamId: t.String() }),
    detail: { summary: 'Apply meta for league team', tags: ['Apply'] }
  })

  // Decline apply explicitly by team captain
  .post('/:leagueTeamId/decline', async ({ params, request, set }) => {
    try {
      const session = await auth.api.getSession({ headers: request.headers });
      if (!session) {
        set.status = 401;
        return { error: true, message: 'Unauthorized' };
      }

      const leagueTeamId = params.leagueTeamId;
      const [lt] = await db
        .select({ id: leagueTeams.id, leagueId: leagueTeams.leagueId, teamId: leagueTeams.teamId, status: leagueTeams.status })
        .from(leagueTeams)
        .where(eq(leagueTeams.id, leagueTeamId));
      if (!lt) { set.status = 404; return { error: true, message: 'League team not found' }; }
      const [lg] = await db.select().from(leagues).where(eq(leagues.id, lt.leagueId));
      if (!lg) { set.status = 404; return { error: true, message: 'League not found' }; }

      // Ensure requester is captain of current team-season
      const [me] = await db.select().from(players).where(eq(players.userId, session.user.id));
      if (!me) { set.status = 403; return { error: true, message: 'No player linked to this user' }; }
      const [tpAuth] = await db.select().from(teamPlayers)
        .where(and(eq(teamPlayers.teamId, lt.teamId), eq(teamPlayers.seasonId, lg.seasonId), eq(teamPlayers.playerId, me.id)));
      if (!tpAuth || !tpAuth.captain) { set.status = 403; return { error: true, message: 'Not team captain' }; }

      await db.update(leagueTeams)
        .set({ status: 'declined', declineReason: 'team_declined', updatedAt: new Date() })
        .where(eq(leagueTeams.id, leagueTeamId));

      // Get team name for logging
      const [team] = await db.select({ name: teams.name }).from(teams).where(eq(teams.id, lt.teamId));
      
      // Log the decline operation
      await LoggingService.logInviteDecline(session.user.id, lg.name, team?.name);

      return { success: true };
    } catch (e) {
      set.status = 500;
      return { error: true, message: e instanceof Error ? e.message : 'Internal error' };
    }
  }, {
    params: t.Object({ leagueTeamId: t.String() }),
    detail: { summary: 'Decline apply explicitly', tags: ['Apply'] }
  })

  // Finalize without rename: approve current league team and persist provided roster
  .post('/:leagueTeamId/confirm', async ({ params, request, body, set }) => {
    try {
      const session = await auth.api.getSession({ headers: request.headers });
      if (!session) {
        set.status = 401;
        return { error: true, message: 'Unauthorized' };
      }

      const leagueTeamId = params.leagueTeamId;
      const payload = body as any;
      const inputPlayers: Array<{ id?: string; clientId?: string; firstName?: string; lastName?: string; nickname?: string; email?: string; shirtSize?: string }>
        = Array.isArray(payload?.players) ? payload.players : [];
      const captainId: string | undefined = payload?.captainId;
      const captainClientId: string | undefined = payload?.captainClientId;

      const [lt] = await db
        .select({ id: leagueTeams.id, leagueId: leagueTeams.leagueId, teamId: leagueTeams.teamId, status: leagueTeams.status })
        .from(leagueTeams)
        .where(eq(leagueTeams.id, leagueTeamId));
      if (!lt) { set.status = 404; return { error: true, message: 'League team not found' }; }
      const [lg] = await db.select().from(leagues).where(eq(leagues.id, lt.leagueId));
      if (!lg) { set.status = 404; return { error: true, message: 'League not found' }; }

      // Ensure requester is captain of current team-season
      const [me] = await db.select().from(players).where(eq(players.userId, session.user.id));
      if (!me) { set.status = 403; return { error: true, message: 'No player linked to this user' }; }
      const [tpAuth] = await db.select().from(teamPlayers)
        .where(and(eq(teamPlayers.teamId, lt.teamId), eq(teamPlayers.seasonId, lg.seasonId), eq(teamPlayers.playerId, me.id)));
      if (!tpAuth || !tpAuth.captain) { set.status = 403; return { error: true, message: 'Not team captain' }; }

      // Enforce unique, non-empty emails across players/users when provided, except current captain's session email
      const sessionEmail = session.user.email as string | undefined;
      for (const p of inputPlayers) {
        const e = String(p.email || '').trim();
        if (!e) { set.status = 400; return { error: true, message: 'Minden játékoshoz szükséges e-mail cím megadása.' }; }
        if (sessionEmail && e.toLowerCase() === sessionEmail.toLowerCase()) continue;
        const [px] = await db.select().from(players).where(eq(players.email, e));
        if (px && (!p.id || px.id !== p.id)) { set.status = 400; return { error: true, message: `Már létező e-mail cím: ${e}` }; }
        const [ux] = await db.select().from(user).where(eq(user.email, e));
        if (ux) { set.status = 400; return { error: true, message: `Felhasználóhoz tartozó e-mail cím: ${e}` }; }
      }

      const result = await db.transaction(async (tx) => {
        // Build/ensure roster
        const finalPlayerIds: string[] = [];
        const clientIdToRealId = new Map<string, string>();
        for (const p of inputPlayers) {
          let pid = p.id as string | undefined;
          if (!pid) {
            // Try reuse by email first
            if (p.email) {
              const [existingByEmail] = await tx.select().from(players).where(eq(players.email, p.email));
              if (existingByEmail) {
                pid = existingByEmail.id as string;
                await tx.update(players).set({ teamId: lt.teamId, shirtSize: (p as any).shirtSize ?? null }).where(eq(players.id, pid));
                if (p.clientId) clientIdToRealId.set(p.clientId, pid);
              }
            }
            if (!pid) {
              const [created] = await tx.insert(players).values({
                nickname: p.nickname || `${p.firstName || ''} ${p.lastName || ''}`.trim() || 'player',
                firstName: p.firstName || null,
                lastName: p.lastName || null,
                email: p.email || null,
                teamId: lt.teamId,
                shirtSize: p.shirtSize || null,
              }).returning();
              pid = created.id as string;
              if (p.clientId) clientIdToRealId.set(p.clientId, pid);
              if (p.email) {
                const token = nanoid(48);
                const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);
                await tx.insert(playerInvitations).values({ playerId: pid, email: p.email, token, expiresAt, status: 'pending' });
                const backendUrl = process.env.BACKEND_PUBLIC_URL || `http://localhost:${process.env.BACKEND_PORT || 3000}`;
                const callbackURL = `${backendUrl}/api/players/link-invite?token=${token}`;
                try { await fetch(`${backendUrl}/api/auth/sign-in/magic-link`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: p.email, callbackURL }) }); } catch {}
              }
            }
          } else {
            await tx.update(players)
              .set({ teamId: lt.teamId, shirtSize: (p as any).shirtSize ?? null, email: p.email || null })
              .where(eq(players.id, pid));
          }
          const existing = await tx.select().from(teamPlayers)
            .where(and(eq(teamPlayers.teamId, lt.teamId), eq(teamPlayers.playerId, pid), eq(teamPlayers.seasonId, lg.seasonId)));
          if (existing.length === 0) {
            await tx.insert(teamPlayers).values({ teamId: lt.teamId, playerId: pid, seasonId: lg.seasonId, captain: false });
          }
          finalPlayerIds.push(pid);
        }

        // Remove players not in the provided list for this season/team
        const current = await tx.select().from(teamPlayers)
          .where(and(eq(teamPlayers.teamId, lt.teamId), eq(teamPlayers.seasonId, lg.seasonId)));
        for (const row of current) {
          if (!finalPlayerIds.includes(row.playerId as string)) {
            await tx.delete(teamPlayers).where(and(eq(teamPlayers.teamId, lt.teamId), eq(teamPlayers.seasonId, lg.seasonId), eq(teamPlayers.playerId, row.playerId)));
          }
        }

        // Set captain
        await tx.update(teamPlayers)
          .set({ captain: false })
          .where(and(eq(teamPlayers.teamId, lt.teamId), eq(teamPlayers.seasonId, lg.seasonId)));
        let effectiveCaptainId = captainId;
        if (!effectiveCaptainId && captainClientId) {
          effectiveCaptainId = clientIdToRealId.get(captainClientId);
        }
        if (effectiveCaptainId) {
          await tx.update(teamPlayers)
            .set({ captain: true })
            .where(and(eq(teamPlayers.teamId, lt.teamId), eq(teamPlayers.seasonId, lg.seasonId), eq(teamPlayers.playerId, effectiveCaptainId)));
        }

        // Approve league team
        await tx.update(leagueTeams)
          .set({ status: 'approved', updatedAt: new Date(), declineReason: null, heir: null })
          .where(eq(leagueTeams.id, lt.id));

        // Get team name for logging
        const [team] = await tx.select({ name: teams.name }).from(teams).where(eq(teams.id, lt.teamId));
        
        // Log the accept operation
        await LoggingService.logInviteAccept(session.user.id, lg.name, team?.name);

        return { approved: true };
      });

      return { success: true, ...result };
    } catch (e) {
      set.status = 500;
      return { error: true, message: e instanceof Error ? e.message : 'Internal error' };
    }
  }, {
    params: t.Object({ leagueTeamId: t.String() }),
    body: t.Object({
      players: t.Array(t.Object({
        id: t.Optional(t.String()),
        clientId: t.Optional(t.String()),
        firstName: t.Optional(t.String()),
        lastName: t.Optional(t.String()),
        nickname: t.Optional(t.String()),
        email: t.Optional(t.String()),
        shirtSize: t.Optional(t.String()),
      })),
      captainId: t.Optional(t.String()),
      captainClientId: t.Optional(t.String()),
    }),
    detail: { summary: 'Finalize without renaming: approve and persist roster', tags: ['Apply'] }
  })
  // Rename flow: create new team, approve in league, copy roster, decline old with heir
  .post('/:leagueTeamId/rename', async ({ params, request, body, set }) => {
    try {
      const session = await auth.api.getSession({ headers: request.headers });
      if (!session) {
        set.status = 401;
        return { error: true, message: 'Unauthorized' };
      }

      const leagueTeamId = params.leagueTeamId;
      const payload = body as any;
      const newTeamName: string = String(payload?.newTeamName || '').trim();
      const inputPlayers: Array<{ id?: string; clientId?: string; firstName?: string; lastName?: string; nickname?: string; email?: string; shirtSize?: string }>
        = Array.isArray(payload?.players) ? payload.players : [];
      const captainId: string | undefined = payload?.captainId;
      const captainClientId: string | undefined = payload?.captainClientId;
      if (!newTeamName) {
        set.status = 400;
        return { error: true, message: 'newTeamName is required' };
      }

      // Load league-team and related
      const [lt] = await db
        .select({ id: leagueTeams.id, leagueId: leagueTeams.leagueId, teamId: leagueTeams.teamId })
        .from(leagueTeams)
        .where(eq(leagueTeams.id, leagueTeamId));
      if (!lt) { set.status = 404; return { error: true, message: 'League team not found' }; }
      const [lg] = await db.select().from(leagues).where(eq(leagues.id, lt.leagueId));
      if (!lg) { set.status = 404; return { error: true, message: 'League not found' }; }

      // Ensure requester is captain of current team-season
      const [me] = await db.select().from(players).where(eq(players.userId, session.user.id));
      if (!me) { set.status = 403; return { error: true, message: 'No player linked to this user' }; }
      const [tpAuth] = await db.select().from(teamPlayers)
        .where(and(eq(teamPlayers.teamId, lt.teamId), eq(teamPlayers.seasonId, lg.seasonId), eq(teamPlayers.playerId, me.id)));
      if (!tpAuth || !tpAuth.captain) { set.status = 403; return { error: true, message: 'Not team captain' }; }

      const result = await db.transaction(async (tx) => {
        // 1) Create new team
        const slug = newTeamName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        const [newTeam] = await tx.insert(teams).values({ name: newTeamName, slug }).returning();

        // 2) Approve in league
        const [newLt] = await tx.insert(leagueTeams).values({ leagueId: lt.leagueId, teamId: newTeam.id as string, status: 'approved' }).returning();

        // 3) Decline old with heir + reason
        await tx.update(leagueTeams)
          .set({ status: 'declined', declineReason: 'renamed_team', heir: newTeam.id as string, updatedAt: new Date() })
          .where(eq(leagueTeams.id, lt.id));

        // 4) Build roster: ensure players exist, assign to season
        const createdOrExistingPlayerIds: string[] = [];
        const clientIdToRealId = new Map<string, string>();
        for (const p of inputPlayers) {
          let pid = p.id as string | undefined;
          if (!pid) {
            // Try reuse by email first
            if (p.email) {
              const [existingByEmail] = await tx.select().from(players).where(eq(players.email, p.email));
              if (existingByEmail) {
                pid = existingByEmail.id as string;
                await tx.update(players).set({ teamId: newTeam.id as string, shirtSize: (p as any).shirtSize ?? null }).where(eq(players.id, pid));
                if (p.clientId) clientIdToRealId.set(p.clientId, pid);
              }
            }
            if (!pid) {
              // Create new player
              const [created] = await tx.insert(players).values({
                nickname: p.nickname || `${p.firstName || ''} ${p.lastName || ''}`.trim() || 'player',
                firstName: p.firstName || null,
                lastName: p.lastName || null,
                email: p.email || null,
                teamId: newTeam.id as string,
                shirtSize: p.shirtSize || null,
              }).returning();
              pid = created.id as string;
              if (p.clientId) clientIdToRealId.set(p.clientId, pid);
              if (p.email) {
                const token = nanoid(48);
                const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);
                await tx.insert(playerInvitations).values({ playerId: pid, email: p.email, token, expiresAt, status: 'pending' });
                const backendUrl = process.env.BACKEND_PUBLIC_URL || `http://localhost:${process.env.BACKEND_PORT || 3000}`;
                const callbackURL = `${backendUrl}/api/players/link-invite?token=${token}`;
                try { await fetch(`${backendUrl}/api/auth/sign-in/magic-link`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: p.email, callbackURL }) }); } catch {}
              }
            }
          } else {
            // Move player base team to new team
            await tx.update(players).set({ teamId: newTeam.id as string, shirtSize: (p as any).shirtSize ?? null }).where(eq(players.id, pid));
          }
          // Assign season link if not exists
          const existing = await tx.select().from(teamPlayers)
            .where(and(eq(teamPlayers.teamId, newTeam.id as string), eq(teamPlayers.playerId, pid), eq(teamPlayers.seasonId, lg.seasonId)));
          if (existing.length === 0) {
            await tx.insert(teamPlayers).values({ teamId: newTeam.id as string, playerId: pid, seasonId: lg.seasonId, captain: false });
          }
          createdOrExistingPlayerIds.push(pid);
        }

        // 5) Set captain
        if (createdOrExistingPlayerIds.length > 0) {
          await tx.update(teamPlayers)
            .set({ captain: false })
            .where(and(eq(teamPlayers.teamId, newTeam.id as string), eq(teamPlayers.seasonId, lg.seasonId)));
          let effectiveCaptainId = captainId;
          if (!effectiveCaptainId && captainClientId) {
            effectiveCaptainId = clientIdToRealId.get(captainClientId);
          }
          if (effectiveCaptainId) {
            await tx.update(teamPlayers)
              .set({ captain: true })
              .where(and(eq(teamPlayers.teamId, newTeam.id as string), eq(teamPlayers.seasonId, lg.seasonId), eq(teamPlayers.playerId, effectiveCaptainId)));
          }
        }

        return { newTeamId: newTeam.id as string, newLeagueTeamId: newLt.id as string };
      });

      // Log the rename and accept operation
      await LoggingService.logInviteAccept(session.user.id, lg.name, newTeamName);

      return { success: true, ...result };
    } catch (e) {
      set.status = 500;
      return { error: true, message: e instanceof Error ? e.message : 'Internal error' };
    }
  }, {
    params: t.Object({ leagueTeamId: t.String() }),
    body: t.Object({
      newTeamName: t.String(),
      players: t.Array(t.Object({
        id: t.Optional(t.String()),
        clientId: t.Optional(t.String()),
        firstName: t.Optional(t.String()),
        lastName: t.Optional(t.String()),
        nickname: t.Optional(t.String()),
        email: t.Optional(t.String()),
        shirtSize: t.Optional(t.String()),
      })),
      captainId: t.Optional(t.String()),
      captainClientId: t.Optional(t.String()),
    }),
    detail: { summary: 'Rename team within league flow', tags: ['Apply'] }
  })


