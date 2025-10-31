import { Elysia, t } from 'elysia';
import { nanoid } from 'nanoid';
import { db } from '../db';
import { players, playerInvitations, user, teamPlayers, teams, matches, playerGamedayMvps, seasons, leagueTeams, leagues } from '../database/schema';
import { ilike, or, and, eq, isNull, inArray } from 'drizzle-orm';
import {
  createPlayer,
  getPlayerById,
  getPlayersByTeam,
  getAllPlayers,
  getPlayersBySeason,
  getPlayersFiltered,
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
    const leagueId = (query as any)?.leagueId as string | undefined;
    const teamId = (query as any)?.teamId as string | undefined;
    
    // Use filtered function if any filter is provided, otherwise use old logic for backwards compatibility
    let rows: any[];
    if (seasonId || leagueId || teamId) {
      rows = await getPlayersFiltered({ seasonId, leagueId, teamId });
    } else {
      rows = await getAllPlayers();
    }
    
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
      summary: 'List players (optionally by season, league, or team)',
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

  // Send or resend a player invite via direct email (no magic link)
  .post('/:id/invite', async ({ params, set }) => {
    try {
      const [p] = await db.select().from(players).where(eq(players.id, params.id));
      if (!p) { set.status = 404; return { error: true, message: 'Player not found' }; }
      if (!p.email) { set.status = 400; return { error: true, message: 'Player email is required to send invite' }; }

      // Create or refresh invitation row
      const token = nanoid(48);
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

      // Send direct email with invite link (no magic link)
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
      const inviteUrl = `${frontendUrl}/auth/accept-invite?token=${encodeURIComponent(token)}`;
      
      // Get team name for email
      let teamName: string | undefined;
      if (p.teamId) {
        const [team] = await db.select().from(teams).where(eq(teams.id, p.teamId));
        teamName = team?.name;
      }

      // Send email using our email service
      const { EmailService } = await import('../services/email.service');
      const PlayerInviteEmail = (await import('../emails/player-invite')).default;
      
      await EmailService.send({
        to: p.email,
        subject: 'Játékos meghívás - ELITE Beerpong',
        react: PlayerInviteEmail({
          inviteUrl,
          recipientName: p.firstName || p.nickname,
          teamName,
          expiresAt: expiresAt.toLocaleDateString('hu-HU'),
          inviterName: 'ELITE Beerpong',
          supportEmail: 'sorpingpong@gmail.com'
        })
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

  // Get player stats (public endpoint)
  .get('/:id/stats', async ({ params, set }) => {
    try {
      const [pl] = await db.select().from(players).where(eq(players.id, params.id));
      if (!pl) {
        set.status = 404;
        return { error: true, message: 'Player not found' };
      }

      // Collect matches that have trackingData including this player
      const rows = await db.select().from(matches);
      const withTracking = (rows as any[]).filter(r => r?.trackingData);
      let totalThrows = 0, hits = 0, nominatedCount = 0;
      for (const r of withTracking) {
        const td = r.trackingData;
        const gh = Array.isArray(td?.gameHistory) ? td.gameHistory : [];
        const myThrows = gh.filter((a: any) => a.playerId === pl.id);
        totalThrows += myThrows.length;
        hits += myThrows.filter((a: any) => a.type === 'hit').length;
        const homeCand = td?.homeTeam?.mvpCandidate;
        const awayCand = td?.awayTeam?.mvpCandidate;
        if (homeCand && homeCand === pl.id) nominatedCount++;
        if (awayCand && awayCand === pl.id) nominatedCount++;
      }
      const hitPercentage = totalThrows > 0 ? Math.round((hits / totalThrows) * 100) : 0;

      // Gameday MVP-k száma
      const gamedayMvps = await db.select().from(playerGamedayMvps).where(eq(playerGamedayMvps.playerId, pl.id));
      const countNormal = (gamedayMvps as any[]).filter(r => (r.mvpType || 1) === 1).length;
      const countFinale = (gamedayMvps as any[]).filter(r => (r.mvpType || 1) === 2 || r.gameDay === 0).length;

      const backendUrl = process.env.BACKEND_PUBLIC_URL || 'http://localhost:3555';
      const fullImageUrl = pl.image ? `${backendUrl}${pl.image}` : `${backendUrl}/uploads/player-images/default.png`;

      return {
        playerId: pl.id,
        playerImage: fullImageUrl,
        totalThrows,
        hits,
        hitPercentage,
        nominatedCount,
        gamedayMvp: {
          total: (gamedayMvps as any[]).length,
          normal: countNormal,
          finale: countFinale
        }
      };
    } catch (error) {
      set.status = 400;
      return { error: true, message: error instanceof Error ? error.message : 'Unknown error occurred' };
    }
  }, {
    params: t.Object({ id: t.String() }),
    detail: { summary: 'Get player stats (public)', tags: ['Players'] }
  })

  // Get player seasons (public endpoint)
  .get('/:id/seasons', async ({ params, set }) => {
    try {
      const [pl] = await db.select().from(players).where(eq(players.id, params.id));
      if (!pl) {
        set.status = 404;
        return { error: true, message: 'Player not found' };
      }

      const links = await db.select().from(teamPlayers).where(eq(teamPlayers.playerId, pl.id));
      const seasonIds = Array.from(new Set((links as any[]).map(l => l.seasonId)));
      const seasonsRows = await db.select().from(seasons);
      const leaguesRows = await db.select().from(leagues);

      const result: any[] = [];
      for (const sid of seasonIds) {
        const season = (seasonsRows as any[]).find(s => s.id === sid);
        const myLink = (links as any[]).find(l => l.seasonId === sid);
        const teamId = myLink?.teamId;
        if (!teamId) continue;
        const team = (await db.select().from(teams).where(eq(teams.id, teamId)))[0];
        
        const seasonLeagues = (leaguesRows as any[]).filter(l => l.seasonId === sid);
        let leagueId: string | null = null;
        for (const l of seasonLeagues) {
          const lts = await db.select().from(leagueTeams).where(eq(leagueTeams.leagueId, l.id));
          if ((lts as any[]).some(lt => lt.teamId === teamId)) {
            leagueId = l.id;
            break;
          }
        }
        if (!leagueId) continue;

        const leagueMs = (await db.select().from(matches).where(eq(matches.leagueId, leagueId))) as any[];
        const completed = leagueMs.filter(m => (m.matchStatus || '').toLowerCase() === 'completed');
        const teamIds = Array.from(new Set([...(completed.map(m => m.homeTeamId)), ...(completed.map(m => m.awayTeamId))] as string[]));
        const stats = new Map<string, { games: number; wins: number }>();
        teamIds.forEach(id => stats.set(id, { games: 0, wins: 0 }));
        for (const m of completed) {
          stats.get(m.homeTeamId)!.games += 1;
          stats.get(m.awayTeamId)!.games += 1;
          if (m.homeTeamScore > m.awayTeamScore) stats.get(m.homeTeamId)!.wins += 1;
          else if (m.awayTeamScore > m.homeTeamScore) stats.get(m.awayTeamId)!.wins += 1;
        }
        const table = teamIds.map(tid => {
          const st = stats.get(tid)!;
          const wr = st.games > 0 ? (st.wins / st.games) : 0;
          return { teamId: tid, games: st.games, wins: st.wins, winRate: wr };
        }).sort((a, b) => (b.wins - a.wins) || (b.winRate - a.winRate));
        
        const position = Math.max(1, table.findIndex(r => r.teamId === teamId) + 1);
        const myRow = table.find(r => r.teamId === teamId) || { games: 0, wins: 0, winRate: 0 };

        let playerThrows = 0, playerHits = 0;
        for (const m of leagueMs) {
          if (!m?.trackingData) continue;
          const gh = Array.isArray(m.trackingData?.gameHistory) ? m.trackingData.gameHistory : [];
          const mine = gh.filter((a: any) => a.playerId === pl.id);
          playerThrows += mine.length;
          playerHits += mine.filter((a: any) => a.type === 'hit').length;
        }
        const playerHitRate = playerThrows > 0 ? playerHits / playerThrows : 0;

        // Check if player is captain
        const isCaptain = myLink?.captain === true;

        result.push({
          seasonId: sid,
          seasonName: season?.name || 'Season',
          team: team?.name || '',
          isCaptain,
          position,
          games: myRow.games,
          wins: myRow.wins,
          winRate: myRow.winRate,
          playerThrows,
          playerHits,
          playerHitRate,
        });
      }

      return { seasons: result };
    } catch (error) {
      set.status = 400;
      return { error: true, message: error instanceof Error ? error.message : 'Unknown error' };
    }
  }, {
    params: t.Object({ id: t.String() }),
    detail: { summary: 'Get player seasons (public)', tags: ['Players'] }
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
  // Validate invite token and get player data for registration
  .get('/validate-invite/:token', async ({ params, set }) => {
    try {
      const token = params.token;
      if (!token) {
        set.status = 400;
        return { error: true, message: 'Hiányzó meghívó token' };
      }

      const [invite] = await db.select().from(playerInvitations).where(eq(playerInvitations.token, token));
      if (!invite) {
        set.status = 404;
        return { error: true, message: 'Érvénytelen meghívó' };
      }

      if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
        set.status = 400;
        return { error: true, message: 'A meghívó lejárt' };
      }

      if (invite.status !== 'pending') {
        set.status = 400;
        return { error: true, message: 'A meghívó már felhasználva!' };
      }

      // Get player data
      const [player] = await db.select().from(players).where(eq(players.id, invite.playerId));
      if (!player) {
        set.status = 404;
        return { error: true, message: 'Játékos nem található' };
      }

      // Get team name if player has team
      let teamName: string | undefined;
      if (player.teamId) {
        const [team] = await db.select().from(teams).where(eq(teams.id, player.teamId));
        teamName = team?.name;
      }

      return {
        success: true,
        data: {
          token,
          email: invite.email,
          nickname: player.nickname,
          firstName: player.firstName,
          lastName: player.lastName,
          fullName: [player.firstName, player.lastName].filter(Boolean).join(' ').trim() || player.nickname,
          teamName,
          expiresAt: invite.expiresAt
        }
      };
    } catch (e) {
      console.error('Validate invite error:', e);
      set.status = 500;
      return { error: true, message: 'Internal error', details: e instanceof Error ? e.message : 'Unknown error' };
    }
  }, {
    params: t.Object({ token: t.String() }),
    detail: { summary: 'Validate invite token and get player data', tags: ['Players'] },
    beforeHandle: ({}) => {} // Public endpoint
  })

  // Accept player invite and register user
  .post('/accept-invite', async ({ request, body, set }) => {
    try {
      const { token, password, email, name, nickname } = body as any;
      
      if (!token || !password || !email || !name) {
        set.status = 400;
        return { error: true, message: 'Missing required fields' };
      }

      if (password.length < 8) {
        set.status = 400;
        return { error: true, message: 'Password must be at least 8 characters' };
      }

      // Validate invite token
      const [invite] = await db.select().from(playerInvitations).where(eq(playerInvitations.token, token));
      if (!invite) {
        set.status = 400;
        return { error: true, message: 'Invalid token' };
      }

      if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
        set.status = 400;
        return { error: true, message: 'Token expired' };
      }

      if (invite.status !== 'pending') {
        set.status = 400;
        return { error: true, message: 'Invite already used' };
      }

      // Check if email matches
      if (invite.email !== email) {
        set.status = 400;
        return { error: true, message: 'Email mismatch' };
      }

      // Create user account using Better Auth
      const backendUrl = process.env.BACKEND_PUBLIC_URL || `http://localhost:${process.env.BACKEND_PORT || 3000}`;
      const signUpResponse = await fetch(`${backendUrl}/api/auth/sign-up/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          name,
          nickname: nickname || name // Use nickname if provided, otherwise use name
        })
      });

      if (!signUpResponse.ok) {
        const errorData = await signUpResponse.json();
        set.status = 400;
        return { error: true, message: errorData.message || 'Failed to create account' };
      }

      const signUpData = await signUpResponse.json();
      const userId = signUpData.user?.id;

      if (!userId) {
        set.status = 500;
        return { error: true, message: 'Failed to get user ID' };
      }

      // Link user to player
      await db.update(players).set({ userId }).where(eq(players.id, invite.playerId));

      // Update player with provided name
      const nameParts = name.trim().split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';
      
      await db.update(players).set({
        firstName: firstName || null,
        lastName: lastName || null,
        nickname: name
      }).where(eq(players.id, invite.playerId));

      // Mark invitation accepted
      await db.update(playerInvitations).set({ 
        status: 'accepted', 
        updatedAt: new Date() 
      }).where(eq(playerInvitations.id, invite.id));

      return { 
        success: true, 
        message: 'Account created and invite accepted successfully',
        userId 
      };
    } catch (e) {
      console.error('Accept invite error:', e);
      set.status = 500;
      return { error: true, message: 'Internal error' };
    }
  }, {
    body: t.Object({ 
      token: t.String(),
      password: t.String(),
      email: t.String(),
      name: t.String()
    }),
    detail: { summary: 'Accept player invitation and register user', tags: ['Players'] },
    beforeHandle: ({}) => {} // Public endpoint
  })

  // Accept player invite and link user to player (for old magic link flow)
  .post('/link-invite', async ({ request, body, set }) => {
    try {
      const token = (body as any)?.token as string;
      if (!token) {
        set.status = 400;
        return { error: true, message: 'Missing token' };
      }
      
      // Require an active session (user is authenticated via magic link)
      const session = await auth.api.getSession({ headers: request.headers });
      if (!session) {
        set.status = 401;
        return { error: true, message: 'Unauthorized' };
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
      
      // Mark invitation accepted
      await db.update(playerInvitations).set({ status: 'accepted', updatedAt: new Date() }).where(eq(playerInvitations.id, invite.id));
      
      return { success: true };
    } catch (e) {
      set.status = 500;
      return { error: true, message: 'Internal error' };
    }
  }, {
    body: t.Object({ token: t.String() }),
    detail: { summary: 'Accept player invitation and link user (old magic link flow)', tags: ['Players'] },
    beforeHandle: ({}) => {} // Public endpoint
  })