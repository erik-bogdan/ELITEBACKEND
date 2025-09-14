import { Elysia, t } from 'elysia';
import { db } from '../db';
import { matches, leagues, teams, teamPlayers, players } from '../database/schema';
import { eq, and, asc } from 'drizzle-orm';
import {
  createMatch,
  getMatchesByLeague,
  getMatchById,
  updateMatchResult,
  updateMatchStatus
} from '../services/matches/match.service';
import { LoggingService } from '../services/logging.service';
import { auth } from '../plugins/auth/auth';

export const matchRouter = new Elysia({ prefix: '/api/matches' })
  .get('/league/:leagueId', async ({ params }) => {
    return await getMatchesByLeague(params.leagueId);
  }, {
    params: t.Object({
      leagueId: t.String()
    }),
    detail: {
      summary: 'Get all matches in a league',
      tags: ['Matches']
    }
  })

  .get('/:id', async ({ params }) => {
    return await getMatchById(params.id);
  }, {
    params: t.Object({
      id: t.String()
    }),
    detail: {
      summary: 'Get match by ID',
      tags: ['Matches']
    }
  })

  .post('/', async ({ body }) => {
    return await createMatch({
      ...body,
      matchAt: new Date(body.matchAt)
    });
  }, {
    body: t.Object({
      leagueId: t.String(),
      homeTeamId: t.String(),
      awayTeamId: t.String(),
      matchAt: t.String(),
      homeFirstPlayerId: t.Optional(t.String()),
      homeSecondPlayerId: t.Optional(t.String()),
      awayFirstPlayerId: t.Optional(t.String()),
      awaySecondPlayerId: t.Optional(t.String()),
      matchStatus: t.Union([
        t.Literal('scheduled'),
        t.Literal('in_progress'),
        t.Literal('completed'),
        t.Literal('cancelled')
      ]),
      matchType: t.Union([
        t.Literal('regular'),
        t.Literal('playoff'),
        t.Literal('final')
      ]),
      matchRound: t.Number(),
      matchTable: t.Number()
    }),
    detail: {
      summary: 'Create a new match',
      tags: ['Matches']
    }
  })

  .put('/:id/result', async ({ params, body, request }) => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      return { error: true, message: 'Unauthorized' };
    }

    const result = await updateMatchResult(params.id, body);
    
    // Get match details for logging
    const match = await getMatchById(params.id);
    if (match && match.match) {
      const homeTeamName = match.homeTeam?.name || 'Ismeretlen csapat';
      const awayTeamName = match.awayTeam?.name || 'Ismeretlen csapat';
      const homeScore = body.homeTeamScore;
      const awayScore = body.awayTeamScore;
      
      // Get championship name
      const [league] = await db.select({ name: leagues.name }).from(leagues).where(eq(leagues.id, match.match.leagueId));
      
      // Log the match result
      await LoggingService.logMatchResult(
        session.user.id,
        homeTeamName,
        awayTeamName,
        homeScore,
        awayScore,
        league?.name
      );
    }
    
    return result;
  }, {
    params: t.Object({
      id: t.String()
    }),
    body: t.Object({
      homeTeamScore: t.Number(),
      awayTeamScore: t.Number(),
      homeTeamBestPlayerId: t.Optional(t.String()),
      awayTeamBestPlayerId: t.Optional(t.String()),
      homeFirstPlayerId: t.Optional(t.String()),
      homeSecondPlayerId: t.Optional(t.String()),
      awayFirstPlayerId: t.Optional(t.String()),
      awaySecondPlayerId: t.Optional(t.String()),
      trackingData: t.Optional(t.Any())
    }),
    detail: {
      summary: 'Update match result and MVPs',
      tags: ['Matches']
    }
  })

  // tracking control
  .put('/:id/tracking/start', async ({ params }) => {
    const { id } = params;
    const [updated] = await db.update(matches)
      .set({ trackingActive: 1, trackingStartedAt: new Date(), trackingFinishedAt: null, matchStatus: 'in_progress' })
      .where(eq(matches.id, id))
      .returning();
    return updated;
  }, {
    params: t.Object({ id: t.String() }),
    detail: { summary: 'Mark tracking as started', tags: ['Matches'] }
  })

  .put('/:id/tracking/sync', async ({ params, body }) => {
    const { id } = params;
    const [updated] = await db.update(matches)
      .set({ trackingData: body.trackingData, trackingActive: 1 })
      .where(eq(matches.id, id))
      .returning();
    return updated;
  }, {
    params: t.Object({ id: t.String() }),
    body: t.Object({ trackingData: t.Any() }),
    detail: { summary: 'Sync tracking payload continuously', tags: ['Matches'] }
  })

  .put('/:id/tracking/finish', async ({ params, body }) => {
    const { id } = params;
    const [updated] = await db.update(matches)
      .set({ trackingActive: 2, trackingData: body?.trackingData, trackingFinishedAt: new Date(), matchStatus: 'completed' })
      .where(eq(matches.id, id))
      .returning();
    return updated;
  }, {
    params: t.Object({ id: t.String() }),
    body: t.Optional(t.Object({ trackingData: t.Any() })),
    detail: { summary: 'Mark tracking as finished', tags: ['Matches'] }
  })

  .put('/:id/status', async ({ params, body }) => {
    return await updateMatchStatus(params.id, body.status);
  }, {
    params: t.Object({
      id: t.String()
    }),
    body: t.Object({
      status: t.Union([
        t.Literal('scheduled'),
        t.Literal('in_progress'),
        t.Literal('completed'),
        t.Literal('cancelled')
      ])
    }),
    detail: {
      summary: 'Update match status',
      tags: ['Matches']
    }
  })
  .get('/:id/meta', async ({ params }) => {
    const id = params.id;
    const [m] = await db.select().from(matches).where(eq(matches.id, id));
    if (!m) throw new Error('Match not found');
    const [league] = await db.select().from(leagues).where(eq(leagues.id, m.leagueId));
    const seasonId = league?.seasonId as string;
    const [homeTeam] = await db.select().from(teams).where(eq(teams.id, m.homeTeamId));
    const [awayTeam] = await db.select().from(teams).where(eq(teams.id, m.awayTeamId));
    const homePlayers = await db
      .select({ id: players.id, nickname: players.nickname, firstName: players.firstName, lastName: players.lastName })
      .from(teamPlayers)
      .innerJoin(players, eq(players.id, teamPlayers.playerId))
      .where(and(eq(teamPlayers.teamId, m.homeTeamId), eq(teamPlayers.seasonId, seasonId)))
      .orderBy(asc(teamPlayers.createdAt));
    const awayPlayers = await db
      .select({ id: players.id, nickname: players.nickname, firstName: players.firstName, lastName: players.lastName })
      .from(teamPlayers)
      .innerJoin(players, eq(players.id, teamPlayers.playerId))
      .where(and(eq(teamPlayers.teamId, m.awayTeamId), eq(teamPlayers.seasonId, seasonId)))
      .orderBy(asc(teamPlayers.createdAt));
    return {
      matchId: id,
      leagueId: m.leagueId,
      seasonId,
      score: { home: m.homeTeamScore, away: m.awayTeamScore },
      selected: {
        homeFirstPlayerId: m.homeFirstPlayerId,
        homeSecondPlayerId: m.homeSecondPlayerId,
        awayFirstPlayerId: m.awayFirstPlayerId,
        awaySecondPlayerId: m.awaySecondPlayerId,
      },
      mvp: {
        home: m.homeTeamBestPlayerId,
        away: m.awayTeamBestPlayerId,
      },
      homeTeam: {
        id: m.homeTeamId,
        name: homeTeam?.name ?? 'Home',
        players: homePlayers.map(p => ({ id: p.id, label: p.nickname || p.firstName || p.lastName }))
      },
      awayTeam: {
        id: m.awayTeamId,
        name: awayTeam?.name ?? 'Away',
        players: awayPlayers.map(p => ({ id: p.id, label: p.nickname || p.firstName || p.lastName }))
      }
    };
  }, {
    params: t.Object({ id: t.String() }),
    detail: { summary: 'Get modal meta for a match (players, current result, MVP)', tags: ['Matches'] }
  });