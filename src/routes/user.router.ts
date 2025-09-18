import { Elysia, t } from 'elysia';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { auth } from '../plugins/auth/auth';
import { db } from '../db';
import { players, seasons, teamPlayers, leagueTeams, leagues, teams, matches, playerGamedayMvps, playerInvitations } from '../database/schema';
import { eq } from 'drizzle-orm';
import { Elysia } from 'elysia';
import { randomUUID } from 'crypto';

export const userRouter = new Elysia({ prefix: '/api/user' })
  .get('/my-league', async ({ request, set }) => {
    try {
      const session = await auth.api.getSession({ headers: request.headers });
      const userId = session?.user?.id as string | undefined;
      if (!userId) {
        set.status = 401;
        return { error: true, message: 'Unauthorized' };
      }
      const [activeSeason] = await db.select().from(seasons).where(eq(seasons.isActive, true));
      if (!activeSeason) {
        set.status = 404;
        return { error: true, message: 'No active season' };
      }
      const [pl] = await db.select().from(players).where(eq(players.userId, userId));
      if (!pl) {
        set.status = 404;
        return { error: true, message: 'Player not found for user' };
      }
      // team based on team_players in active season (preferred), otherwise player.teamId fallback
      const [rel] = await db.select().from(teamPlayers).where(eq(teamPlayers.playerId, pl.id));
      const teamId = rel?.teamId || pl.teamId;
      if (!teamId) {
        set.status = 404;
        return { error: true, message: 'Team not found for player in active season' };
      }
      // find a league in active season where this team participates
      const leaguesInSeason = await db.select().from(leagues).where(eq(leagues.seasonId, activeSeason.id));
      const leagueIds = new Set((leaguesInSeason as any[]).map(l => l.id));
      const leagueTeamRows = await db.select().from(leagueTeams).where(eq(leagueTeams.teamId, teamId));
      const found = (leagueTeamRows as any[]).find(lt => leagueIds.has(lt.leagueId));
      if (!found) {
        set.status = 404;
        return { error: true, message: 'No league found for player team in active season' };
      }
      const [team] = await db.select().from(teams).where(eq(teams.id, teamId));
      return { leagueId: found.leagueId, teamId, teamName: team?.name || null };
    } catch (error) {
      set.status = 400;
      return { error: true, message: error instanceof Error ? error.message : 'Unknown error occurred' };
    }
  });

// Active invite for logged-in captain in active season → returns leagueTeamId to redirect FE
userRouter.get('/active-invite', async ({ request, set }) => {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    const userId = session?.user?.id as string | undefined;
    const userEmail = session?.user?.email as string | undefined;
    if (!userId) { set.status = 401; return { error: true, message: 'Unauthorized' }; }

    // get active season
    const [activeSeason] = await db.select().from(seasons).where(eq(seasons.isActive, true));
    if (!activeSeason) return { hasInvite: false };

    // find player linked to user; if nincs, próbáljuk email alapján
    let cp: any = (await db.select().from(players).where(eq(players.userId, userId)))?.[0] || null;
    if (!cp && userEmail) {
      cp = (await db.select().from(players).where(eq(players.email, userEmail)))?.[0] || null;
    }
    if (!cp) return { hasInvite: false };

    // ensure captain in active season
    const capRel = (await db.select().from(teamPlayers)
      .where(eq(teamPlayers.playerId, cp.id)))
      .find(r => r.seasonId === activeSeason.id && r.captain === true);
    if (!capRel) return { hasInvite: false };

    const teamId = capRel.teamId as string;

    // find leagueTeam in active season for this team
    const leaguesInSeason = await db.select().from(leagues).where(eq(leagues.seasonId, activeSeason.id));
    const leagueIds = new Set((leaguesInSeason as any[]).map(l => l.id));
    const lts = await db.select().from(leagueTeams).where(eq(leagueTeams.teamId, teamId));
    const rel = (lts as any[]).find(lt => leagueIds.has(lt.leagueId));

    // Compute team-level invitation state purely from league_teams status
    const leaguePending = !!rel && (((rel as any).status || 'pending') === 'pending');
    // Determine if user already accepted the latest invite (if any). We only consider the most recent record.
    // IMPORTANT: If leaguePending === true, we always report accepted=false (even if there was an older accepted invite),
    // because the active team-level invitation is still pending.
    let accepted = false as boolean;
    if (!leaguePending) {
      try {
        const rows1 = await db.select().from(playerInvitations).where(eq(playerInvitations.playerId, cp.id));
        const rows2 = userEmail ? await db.select().from(playerInvitations).where(eq(playerInvitations.email, userEmail)) : [];
        const all = [...(rows1 as any[]), ...(rows2 as any[])];
        if (all.length > 0) {
          all.sort((a, b) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime());
          const latest = all[0];
          accepted = (latest?.status || '') === 'accepted';
        }
      } catch {}
    }

    if (!leaguePending) return { hasInvite: false, accepted };

    // Load championship meta for FE text replacement
    let championship: any = null;
    if (rel) {
      const [lg] = await db.select().from(leagues).where(eq(leagues.id, rel.leagueId));
      championship = lg ? { id: lg.id, name: lg.name, subName: (lg as any).subName || null, seasonId: lg.seasonId } : null;
    }
    return { hasInvite: true, leagueTeamId: rel?.id || null, championship, accepted };
  } catch {
    set.status = 400; return { error: true, message: 'Failed to load active invite' };
  }
});
// Change password (delegated to auth plugin if available)
userRouter.put('/profile/password', async ({ request, body, set }) => {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    const userId = session?.user?.id as string | undefined;
    if (!userId) { set.status = 401; return { error: true, message: 'Unauthorized' }; }
    // Use better-auth email/password API
    await auth.api.updatePassword({ headers: request.headers, body: { currentPassword: (body as any).currentPassword, newPassword: (body as any).newPassword } });
    return { success: true };
  } catch (error) {
    set.status = 400; return { error: true, message: error instanceof Error ? error.message : 'Unknown error' };
  }
}, {
  body: t.Object({ currentPassword: t.String(), newPassword: t.String() }) as any
});

// Update avatar (store url in players.image)
userRouter.put('/profile/avatar', async ({ request, body, set }) => {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    const userId = session?.user?.id as string | undefined;
    if (!userId) { set.status = 401; return { error: true, message: 'Unauthorized' }; }
    const [pl] = await db.select().from(players).where(eq(players.userId, userId));
    if (!pl) { set.status = 404; return { error: true, message: 'Player not found' }; }
    // backcompat: if image is data URL, save to uploads and store relative path
    const payload = body as any;
    let storedUrl: string | null = null;
    if (payload?.image && typeof payload.image === 'string' && payload.image.startsWith('data:image')) {
      const base64 = payload.image.split(',')[1];
      const buffer = Buffer.from(base64, 'base64');
      const filename = `${pl.id}-${Date.now()}.png`;
      const dest = join(process.cwd(), 'uploads', 'player-images', filename);
      await writeFile(dest, buffer);
      storedUrl = `/uploads/player-images/${filename}`;
    } else if (payload?.image) {
      storedUrl = payload.image;
    }
    const [updated] = await db.update(players).set({ image: storedUrl }).where(eq(players.id, pl.id)).returning();
    
    // Return full URL for the image
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:3555';
    const fullImageUrl = storedUrl ? `${backendUrl}${storedUrl}` : null;
    
    return { 
      success: true, 
      player: { 
        ...updated, 
        image: fullImageUrl 
      } 
    };
  } catch (error) {
    set.status = 400; return { error: true, message: error instanceof Error ? error.message : 'Unknown error' };
  }
}, {
  body: t.Object({ image: t.String() }) as any
});


// Profile stats: MVP jelölések, hit%, gameday MVP-k
userRouter.get('/profile/stats', async ({ request, set }) => {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    const userId = session?.user?.id as string | undefined;
    if (!userId) {
      set.status = 401; return { error: true, message: 'Unauthorized' };
    }
    const [pl] = await db.select().from(players).where(eq(players.userId, userId));
    if (!pl) { set.status = 404; return { error: true, message: 'Player not found' }; }

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
      // MVP jelölés logika: ha a trackingData.homeTeam.mvpCandidate / awayTeam.mvpCandidate tárolva lenne
      // Most: ha selectedPlayers tartalmazza és mvp szerepel (bestPlayer), növeljük, fallback 0
      const homeCand = td?.homeTeam?.mvpCandidate;
      const awayCand = td?.awayTeam?.mvpCandidate;
      if (homeCand && homeCand === pl.id) nominatedCount++;
      if (awayCand && awayCand === pl.id) nominatedCount++;
    }
    const hitPercentage = totalThrows > 0 ? Math.round((hits / totalThrows) * 100) : 0;

    // Gameday MVP-k száma (normal vs finale)
    const gamedayMvps = await db.select().from(playerGamedayMvps).where(eq(playerGamedayMvps.playerId, pl.id));
    const countNormal = (gamedayMvps as any[]).filter(r => (r.mvpType || 1) === 1).length;
    const countFinale = (gamedayMvps as any[]).filter(r => (r.mvpType || 1) === 2 || r.gameDay === 0).length;

    // Return full URL for the player image
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:3555';
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
});

// Seasons summary with position/games/wins/winRate
userRouter.get('/profile/seasons', async ({ request, set }) => {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    const userId = session?.user?.id as string | undefined;
    if (!userId) { set.status = 401; return { error: true, message: 'Unauthorized' }; }
    const [pl] = await db.select().from(players).where(eq(players.userId, userId));
    if (!pl) { set.status = 404; return { error: true, message: 'Player not found' }; }

    // Collect seasons where the player is/was registered
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
      // find league for this season that contains this team
      const seasonLeagues = (leaguesRows as any[]).filter(l => l.seasonId === sid);
      let leagueId: string | null = null;
      for (const l of seasonLeagues) {
        const lts = await db.select().from(leagueTeams).where(eq(leagueTeams.leagueId, l.id));
        if ((lts as any[]).some(lt => lt.teamId === teamId)) { leagueId = l.id; break; }
      }
      if (!leagueId) continue;

      // Fetch matches in league and compute standings by wins, then winRate
      const leagueMs = (await db.select().from(matches).where(eq(matches.leagueId, leagueId))) as any[];
      const completed = leagueMs.filter(m => (m.matchStatus || '').toLowerCase() === 'completed');
      const teamIds = Array.from(new Set([...(completed.map(m => m.homeTeamId)), ...(completed.map(m => m.awayTeamId))] as string[]));
      const stats = new Map<string, { games: number; wins: number }>();
      teamIds.forEach(id => stats.set(id, { games: 0, wins: 0 }));
      for (const m of completed) {
        stats.get(m.homeTeamId)!.games += 1; stats.get(m.awayTeamId)!.games += 1;
        if (m.homeTeamScore > m.awayTeamScore) stats.get(m.homeTeamId)!.wins += 1; else if (m.awayTeamScore > m.homeTeamScore) stats.get(m.awayTeamId)!.wins += 1;
      }
      const table = teamIds.map(tid => {
        const st = stats.get(tid)!; const wr = st.games > 0 ? (st.wins / st.games) : 0;
        return { teamId: tid, games: st.games, wins: st.wins, winRate: wr };
      }).sort((a, b) => (b.wins - a.wins) || (b.winRate - a.winRate));
      const position = Math.max(1, table.findIndex(r => r.teamId === teamId) + 1);
      const myRow = table.find(r => r.teamId === teamId) || { games: 0, wins: 0, winRate: 0 };

      // Aggregate player's throws/hits for this season across ALL league matches with tracking
      let playerThrows = 0, playerHits = 0;
      for (const m of leagueMs) {
        if (!m?.trackingData) continue;
        const gh = Array.isArray(m.trackingData?.gameHistory) ? m.trackingData.gameHistory : [];
        const mine = gh.filter((a: any) => a.playerId === pl.id);
        playerThrows += mine.length;
        playerHits += mine.filter((a: any) => a.type === 'hit').length;
      }
      const playerHitRate = playerThrows > 0 ? playerHits / playerThrows : 0;

      result.push({
        seasonId: sid,
        seasonName: season?.name || 'Season',
        team: team?.name || '',
        isCaptain: false,
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
    set.status = 400; return { error: true, message: error instanceof Error ? error.message : 'Unknown error' };
  }
});

export default userRouter;


