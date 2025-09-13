import { Elysia } from 'elysia';
import { 
  generateSchedule, 
  getLeagueTeams, 
  addTeamToLeague, 
  removeTeamFromLeague,
  
  createChampionship,
  getChampionship,
  getAllChampionships,
  updateChampionship,
  archiveChampionship,
  getAvailableTeamsForLeague,
  computeStandings,
  computeGameDayMvps,
  computeRankSeries
} from '../services/championships/championsip.service';
import { db } from '../db';
import { leagueTeams, matches, leagues, seasons, teams, teamPlayers, players, playerInvitations } from '../database/schema';
import { eq, sql, and } from 'drizzle-orm';
import TeamInviteEmail from '../emails/invite';
import { EmailService } from '../services/email.service';
import { nanoid } from 'nanoid';

export const championshipRouter = new Elysia({ prefix: '/api/championship' })
  .post('/', async ({ body, set }) => {
    try {
      return await createChampionship(body as any);
    } catch (error) {
      set.status = 400;
      return {
        error: true,
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  })
  .get('/:id/rank-series/:teamId', async ({ params: { id, teamId }, set }) => {
    try {
      const series = await computeRankSeries(id, teamId);
      return { series };
    } catch (error) {
      set.status = 400;
      return { error: true, message: error instanceof Error ? error.message : 'Unknown error occurred' };
    }
  })
  .get('/:id/standings', async ({ params: { id }, set }) => {
    try {
      const standings = await computeStandings(id);
      return { standings };
    } catch (error) {
      set.status = 400;
      return { error: true, message: error instanceof Error ? error.message : 'Unknown error occurred' };
    }
  })
  .get('/:id/standings/upto/:gameDay', async ({ params: { id, gameDay }, set }) => {
    try {
      const gd = Number(gameDay);
      if (!Number.isFinite(gd) || gd < 1) throw new Error('Invalid gameDay');
      const standings = await computeStandings(id, { uptoGameDay: gd });
      return { standings };
    } catch (error) {
      set.status = 400;
      return { error: true, message: error instanceof Error ? error.message : 'Unknown error occurred' };
    }
  })
  .get('/:id/standings/upto-round/:round', async ({ params: { id, round }, set }) => {
    try {
      const rd = Number(round);
      if (!Number.isFinite(rd) || rd < 1) throw new Error('Invalid round');
      const standings = await computeStandings(id, { uptoRound: rd });
      return { standings };
    } catch (error) {
      set.status = 400;
      return { error: true, message: error instanceof Error ? error.message : 'Unknown error occurred' };
    }
  })
  .get('/:id/standings/day/:date', async ({ params: { id, date }, set }) => {
    try {
      const standings = await computeStandings(id, { date });
      return { standings };
    } catch (error) {
      set.status = 400;
      return { error: true, message: error instanceof Error ? error.message : 'Unknown error occurred' };
    }
  })
  .get('/:id/mvps', async ({ params: { id }, set }) => {
    try {
      const mvps = await computeGameDayMvps(id);
      return { mvps };
    } catch (error) {
      set.status = 400;
      return { error: true, message: error instanceof Error ? error.message : 'Unknown error occurred' };
    }
  })
  .get('/', async () => {
    return await getAllChampionships();
  })
  .get('/:id', async ({ params: { id }, set }) => {
    try {
      const championship = await getChampionship(id);
      if (!championship) {
        set.status = 404;
        return {
          error: true,
          message: 'Championship not found'
        };
      }
      return championship;
    } catch (error) {
      set.status = 400;
      return {
        error: true,
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  })
  .put('/:id', async ({ params: { id }, body, set }) => {
    try {
      const championship = await updateChampionship(id, body as any);
      if (!championship) {
        set.status = 404;
        return {
          error: true,
          message: 'Championship not found'
        };
      }
      return championship;
    } catch (error) {
      set.status = 400;
      return {
        error: true,
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  })
  .delete('/:id', async ({ params: { id }, set }) => {
    try {
      const success = await archiveChampionship(id);
      if (!success) {
        set.status = 404;
        return {
          error: true,
          message: 'Championship not found'
        };
      }
      return { success: true };
    } catch (error) {
      set.status = 400;
      return {
        error: true,
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  })
  .get('/matches', ({ query, set }) => {
    if (!query.matchesPerDay || typeof query.matchesPerDay !== 'string') {
      set.status = 400;
      return {
        error: true,
        message: 'A matchesPerDay paraméter megadása kötelező. Példa: ?matchesPerDay=4-5-4-5-4'
      };
    }

    const matchesPerDay = query.matchesPerDay.split('-').map(num => {
      const parsed = Number(num);
      if (isNaN(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
        throw new Error('Invalid number');
      }
      return parsed;
    });
    
    try {
      return generateSchedule({
        teams: [], // This will be populated from the database
        matchesPerDay,
        startTime: query.startTime as string || "08:00",
        matchDuration: Number(query.matchDuration) || 40,
        tables: Number(query.tables) || 6
      });
    } catch (error) {
      set.status = 400;
      return {
        error: true,
        message: 'A matchesPerDay paraméter csak pozitív egész számokat tartalmazhat, kötőjellel elválasztva'
      };
    }
  })
  .get('/teams/:leagueId', async ({ params: { leagueId }, set }) => {
    try {
      return await getLeagueTeams(leagueId);
    } catch (error) {
      set.status = 400;
      return {
        error: true,
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  })
  .get('/teams/:leagueId/available', async ({ params: { leagueId }, set }) => {
    try {
      return await getAvailableTeamsForLeague(leagueId);
    } catch (error) {
      set.status = 400;
      return {
        error: true,
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  })
  .post('/teams/:leagueId/:teamId', async ({ params: { leagueId, teamId }, set }) => {
    try {
      await addTeamToLeague(leagueId, teamId);
      return { success: true };
    } catch (error) {
      set.status = 400;
      return {
        error: true,
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  })
  .delete('/teams/:leagueId/:teamId', async ({ params: { leagueId, teamId }, set }) => {
    try {
      await removeTeamFromLeague(leagueId, teamId);
      return { success: true };
    } catch (error) {
      set.status = 400;
      return {
        error: true,
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  })
  .post('/teams/invite/:leagueTeamId', async ({ params: { leagueTeamId }, set }) => {
    try {
      // Lookup league-team relation
      const [rel] = await db.select().from(leagueTeams).where(eq(leagueTeams.id, leagueTeamId));
      if (!rel) throw new Error('LeagueTeam not found');
      const [league] = await db.select().from(leagues).where(eq(leagues.id, rel.leagueId));
      if (!league) throw new Error('League not found');
      const [team] = await db.select().from(teams).where(eq(teams.id, rel.teamId));
      if (!team) throw new Error('Team not found');
      const [season] = await db.select().from(seasons).where(eq(seasons.id, league.seasonId));
      if (!season) throw new Error('Season not found');

      // Find captain for this team in this season
      const capRel = (await db.select().from(teamPlayers)
        .where(eq(teamPlayers.teamId, rel.teamId)))
        .find(r => r.seasonId === league.seasonId && r.captain === true);
      if (!capRel) throw new Error('Még nincs csapatkapitány beállítva a csapatban');
      const [cap] = await db.select().from(players).where(eq(players.id, capRel.playerId));
      if (!cap?.email || !String(cap.email).trim()) throw new Error('A csapatkapitánynak nincs e-mail címe');

      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
      // Create a player_invitation token for this captain so /api/players/link-invite can validate it
      const inviteToken = nanoid(48);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await db.insert(playerInvitations).values({
        playerId: cap.id,
        email: cap.email,
        token: inviteToken,
        expiresAt,
        status: 'pending'
      });

      // Trigger Better Auth magic-link email by calling BA sign-in
      const backendUrl = process.env.BACKEND_PUBLIC_URL || `http://localhost:${process.env.BACKEND_PORT || 3000}`;
      const callbackURL = `${backendUrl}/api/players/link-invite?token=${encodeURIComponent(inviteToken)}&champ=${encodeURIComponent(`${league.name}${league.subName ? ' ' + league.subName : ''}`)}&team=${encodeURIComponent(team.name || '')}&lt=${encodeURIComponent(leagueTeamId)}`;
      try {
        const baRes = await fetch(`${backendUrl}/api/auth/sign-in/magic-link`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: cap.email, callbackURL })
        });
        if (!baRes.ok) throw new Error('Magic link request failed');

        // Mark invite sent
        await db.update(leagueTeams)
          .set({ inviteSent: true, inviteSentDate: new Date(), updatedAt: new Date() })
          .where(eq(leagueTeams.id, leagueTeamId));

        return { success: true };
      } catch (err) {
        console.error('Failed to send league team invite email', {
          to: cap.email,
          leagueTeamId,
          smtp: { host: process.env.SMTP_HOST, port: process.env.SMTP_PORT, secure: process.env.SMTP_SECURE }
        }, err);
        set.status = 400;
        return { error: true, message: 'Failed to send invite email' };
      }
    } catch (error) {
      set.status = 400;
      return { error: true, message: error instanceof Error ? error.message : 'Unknown error occurred' };
    }
  })
  .post('/:id/generate-schedule', async ({ params: { id }, body, set }) => {
    try {
      const { teams, matchesPerDay, startTime, matchDuration, tables, dayDates } = body as any;
      if (!Array.isArray(teams) || teams.length < 2) throw new Error('Minimum 2 csapat kell');
      if (!Array.isArray(matchesPerDay) || matchesPerDay.length === 0) throw new Error('matchesPerDay szükséges');
      const schedule = generateSchedule({ teams, matchesPerDay, startTime, matchDuration, tables });
      const scheduleWithDates = Array.isArray(dayDates)
        ? schedule.map((m: any) => ({ ...m, date: dayDates[m.day - 1] || null }))
        : schedule;
      return { schedule: scheduleWithDates };
    } catch (error) {
      set.status = 400;
      return { error: true, message: (error as any)?.message || 'Invalid input' };
    }
  })

// Persist generated schedule into matches table
  .post('/:id/save-schedule', async ({ params: { id }, body, set }) => {
    try {
      const { schedule, dayDates } = body as any;
      if (!Array.isArray(schedule) || schedule.length === 0) throw new Error('schedule required');
      // Here we only persist structure; mapping team names->leagueTeamIds must be handled on FE or an additional lookup
      // Assuming schedule items contain: home, away, table, day, startTime
      // Find league team mapping by team name (attached to league)
      const attached = await getLeagueTeams(id);
      const nameToTeam = new Map(attached.map((t: any) => [t.name, t]));
      const rows: any[] = [];
      // Ensure continuity if there are already saved matches for this league
      const maxRoundRows = await db
        .select({ maxRound: sql<number>`COALESCE(MAX(${matches.matchRound}), 0)` })
        .from(matches)
        .where(eq(matches.leagueId, id));
      const baseRoundOffset = Number(maxRoundRows?.[0]?.maxRound ?? 0);
      for (const m of schedule) {
        const home = nameToTeam.get(m.home);
        const away = nameToTeam.get(m.away);
        if (!home || !away) continue;
        const dateStr = (Array.isArray(dayDates) && m.day ? dayDates[m.day - 1] : m.date) || new Date().toISOString().slice(0,10);
        const dateTimeISO = `${dateStr}T${(m.startTime || '00:00')}:00`;
        rows.push({
          leagueId: id,
          teamId: home.id,
          homeTeamId: home.id,
          awayTeamId: away.id,
          homeLeagueTeamId: home._leagueTeamId,
          awayLeagueTeamId: away._leagueTeamId,
          homeTeamScore: 0,
          awayTeamScore: 0,
          matchAt: new Date(dateTimeISO),
          matchDate: new Date(dateStr),
          matchTime: new Date(dateTimeISO),
          matchStatus: 'scheduled',
          matchType: 'regular',
          matchRound: baseRoundOffset + (typeof m.round === 'number' ? m.round : (typeof m.slot === 'number' ? m.slot + 1 : 1)),
          gameDay: m.day || 1,
          matchTable: m.table || 1,
        });
      }
      if (rows.length === 0) throw new Error('No rows to save');
      await db.insert(matches as any).values(rows as any);
      // After saving, set league started
      await db.update(leagues)
        .set({ isStarted: true, phase: 'regular', regularRound: 1, updatedAt: new Date() as any })
        .where(eq(leagues.id, id));
      return { success: true, saved: rows.length };
    } catch (error) {
      set.status = 400;
      return { error: true, message: (error as any)?.message || 'Invalid input' };
    }
  })
  .get('/stats', async ({ set }) => {
    try {
      // Get all active championships
      const activeChampionships = await db.select()
        .from(leagues)
        .where(eq(leagues.isArchived, false))
        .orderBy(leagues.createdAt);

      const stats = await Promise.all(
        activeChampionships.map(async (championship) => {
          // Get teams count for this championship
          const teamCount = await db.select({ count: sql<number>`count(*)` })
            .from(leagueTeams)
            .where(eq(leagueTeams.leagueId, championship.id));
          
          // Get total matches count
          const totalMatches = await db.select({ count: sql<number>`count(*)` })
            .from(matches)
            .where(eq(matches.leagueId, championship.id));
          
          // Get completed matches count
          const completedMatches = await db.select({ count: sql<number>`count(*)` })
            .from(matches)
            .where(and(
              eq(matches.leagueId, championship.id),
              eq(matches.matchStatus, 'completed')
            ));

          return {
            id: championship.id,
            name: championship.name,
            subName: championship.subName,
            logo: championship.logo,
            createdAt: championship.createdAt,
            teams: Number(teamCount[0]?.count || 0),
            totalMatches: Number(totalMatches[0]?.count || 0),
            completedMatches: Number(completedMatches[0]?.count || 0),
            status: Number(completedMatches[0]?.count || 0) === 0 ? 'upcoming' : 
                   Number(completedMatches[0]?.count || 0) === Number(totalMatches[0]?.count || 0) ? 'completed' : 'ongoing'
          };
        })
      );

      return { championships: stats };
    } catch (error) {
      set.status = 500;
      return { error: true, message: error instanceof Error ? error.message : 'Unknown error occurred' };
    }
  });
export default championshipRouter;