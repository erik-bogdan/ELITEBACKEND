import { db } from '../../db';
import { matches, leagues, teams, players, seasons, leagueTeams } from '../../database/schema';
import { eq, and, asc, sql, or, inArray } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

export interface MatchResult {
  homeTeamScore: number;
  awayTeamScore: number;
  homeTeamBestPlayerId?: string;
  awayTeamBestPlayerId?: string;
  homeFirstPlayerId?: string;
  homeSecondPlayerId?: string;
  awayFirstPlayerId?: string;
  awaySecondPlayerId?: string;
  trackingData?: any;
}

export interface CreateMatchInput {
  leagueId: string;
  homeTeamId: string;
  awayTeamId: string;
  matchAt: Date;
  matchStatus: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  matchType: 'regular' | 'playoff' | 'final';
  matchRound: number;
  matchTable: number;
}

export async function createMatch(data: CreateMatchInput) {
  // Check if league exists
  const [league] = await db.select().from(leagues).where(eq(leagues.id, data.leagueId));
  if (!league) {
    throw new Error('League not found');
  }

  // Check if teams exist
  const [homeTeam] = await db.select().from(teams).where(eq(teams.id, data.homeTeamId));
  const [awayTeam] = await db.select().from(teams).where(eq(teams.id, data.awayTeamId));
  if (!homeTeam || !awayTeam) {
    throw new Error('One or both teams not found');
  }

  // Create match
  const [match] = await db.insert(matches).values({
    leagueId: data.leagueId,
    teamId: data.homeTeamId,
    homeTeamId: data.homeTeamId,
    awayTeamId: data.awayTeamId,
    matchAt: data.matchAt,
    matchDate: data.matchAt,
    matchTime: data.matchAt,
    matchStatus: data.matchStatus,
    matchType: data.matchType,
    matchRound: data.matchRound,
    matchTable: data.matchTable,
    homeTeamScore: 0,
    awayTeamScore: 0
  }).returning();

  return match;
}

export async function getMatchesByLeague(leagueId: string) {
  // Check if league exists
  const [league] = await db.select().from(leagues).where(eq(leagues.id, leagueId));
  if (!league) {
    throw new Error('League not found');
  }

  // Get all matches for the league
  const homeTeams = alias(teams, 'home_teams');
  const awayTeams = alias(teams, 'away_teams');
  const homeMvp = alias(players, 'home_mvp');
  const awayMvp = alias(players, 'away_mvp');
  const homeFirstPlayer = alias(players, 'home_first_player');
  const homeSecondPlayer = alias(players, 'home_second_player');
  const awayFirstPlayer = alias(players, 'away_first_player');
  const awaySecondPlayer = alias(players, 'away_second_player');

  const leagueMatches = await db.select({
    match: {
      id: matches.id,
      leagueId: matches.leagueId,
      teamId: matches.teamId,
      homeTeamId: matches.homeTeamId,
      awayTeamId: matches.awayTeamId,
      homeLeagueTeamId: matches.homeLeagueTeamId,
      awayLeagueTeamId: matches.awayLeagueTeamId,
      homeTeamScore: matches.homeTeamScore,
      awayTeamScore: matches.awayTeamScore,
      homeTeamBestPlayerId: matches.homeTeamBestPlayerId,
      awayTeamBestPlayerId: matches.awayTeamBestPlayerId,
      homeFirstPlayerId: matches.homeFirstPlayerId,
      homeSecondPlayerId: matches.homeSecondPlayerId,
      awayFirstPlayerId: matches.awayFirstPlayerId,
      awaySecondPlayerId: matches.awaySecondPlayerId,
      matchAt: matches.matchAt,
      matchDate: matches.matchDate,
      matchTime: matches.matchTime,
      matchStatus: matches.matchStatus,
      matchType: matches.matchType,
      matchRound: matches.matchRound,
      gameDay: matches.gameDay,
      matchTable: matches.matchTable,
      trackingActive: matches.trackingActive,
      trackingStartedAt: matches.trackingStartedAt,
      trackingFinishedAt: matches.trackingFinishedAt,
      trackingData: matches.trackingData,
      isDelayed: matches.isDelayed,
      delayedRound: matches.delayedRound,
      delayedGameDay: matches.delayedGameDay,
      delayedDate: matches.delayedDate,
      delayedTime: matches.delayedTime,
      delayedTable: matches.delayedTable,
      createdAt: matches.createdAt,
      updatedAt: matches.updatedAt
    },
    homeTeam: homeTeams,
    awayTeam: awayTeams,
    homeTeamBestPlayer: homeMvp,
    awayTeamBestPlayer: awayMvp,
    homeFirstPlayer: homeFirstPlayer,
    homeSecondPlayer: homeSecondPlayer,
    awayFirstPlayer: awayFirstPlayer,
    awaySecondPlayer: awaySecondPlayer
  })
  .from(matches)
  .leftJoin(homeTeams, eq(matches.homeTeamId, homeTeams.id))
  .leftJoin(awayTeams, eq(matches.awayTeamId, awayTeams.id))
  .leftJoin(homeMvp, eq(matches.homeTeamBestPlayerId, homeMvp.id))
  .leftJoin(awayMvp, eq(matches.awayTeamBestPlayerId, awayMvp.id))
  .leftJoin(homeFirstPlayer, eq(matches.homeFirstPlayerId, homeFirstPlayer.id))
  .leftJoin(homeSecondPlayer, eq(matches.homeSecondPlayerId, homeSecondPlayer.id))
  .leftJoin(awayFirstPlayer, eq(matches.awayFirstPlayerId, awayFirstPlayer.id))
  .leftJoin(awaySecondPlayer, eq(matches.awaySecondPlayerId, awaySecondPlayer.id))
  .where(eq(matches.leagueId, leagueId))
  .orderBy(asc(matches.matchAt), asc(matches.matchTable));

  // Debug: log the first match to see if trackingData is included
  if (leagueMatches.length > 0) {
    console.log('First match data:', JSON.stringify(leagueMatches[0], null, 2));
  }

  return leagueMatches;
}

export async function getMatchesByTeam(teamId: string, seasonId?: string) {
  // If seasonId is not provided, use active season
  let targetSeasonId = seasonId;
  if (!targetSeasonId) {
    const [activeSeason] = await db.select().from(seasons).where(eq(seasons.isActive, true));
    if (!activeSeason) {
      throw new Error('No active season found');
    }
    targetSeasonId = activeSeason.id;
  }

  // Get all leagues for this season where the team participates
  const leaguesInSeason = await db.select().from(leagues).where(eq(leagues.seasonId, targetSeasonId));
  const leagueIds = leaguesInSeason.map(l => l.id);
  
  // Verify team is in at least one league
  let teamLeagues: any[] = [];
  if (leagueIds.length > 0) {
    teamLeagues = await db.select().from(leagueTeams)
      .where(and(eq(leagueTeams.teamId, teamId), inArray(leagueTeams.leagueId, leagueIds)));
  }
  
  if (leagueIds.length === 0 || teamLeagues.length === 0) {
    return []; // Team not in any league for this season
  }

  const leagueIdsForTeam = teamLeagues.map(tl => tl.leagueId);

  // Get all matches for the team (as home or away) in these leagues
  const homeTeams = alias(teams, 'home_teams');
  const awayTeams = alias(teams, 'away_teams');
  const homeMvp = alias(players, 'home_mvp');
  const awayMvp = alias(players, 'away_mvp');
  const homeFirstPlayer = alias(players, 'home_first_player');
  const homeSecondPlayer = alias(players, 'home_second_player');
  const awayFirstPlayer = alias(players, 'away_first_player');
  const awaySecondPlayer = alias(players, 'away_second_player');

  const teamMatches = await db.select({
    match: {
      id: matches.id,
      leagueId: matches.leagueId,
      teamId: matches.teamId,
      homeTeamId: matches.homeTeamId,
      awayTeamId: matches.awayTeamId,
      homeLeagueTeamId: matches.homeLeagueTeamId,
      awayLeagueTeamId: matches.awayLeagueTeamId,
      homeTeamScore: matches.homeTeamScore,
      awayTeamScore: matches.awayTeamScore,
      homeTeamBestPlayerId: matches.homeTeamBestPlayerId,
      awayTeamBestPlayerId: matches.awayTeamBestPlayerId,
      homeFirstPlayerId: matches.homeFirstPlayerId,
      homeSecondPlayerId: matches.homeSecondPlayerId,
      awayFirstPlayerId: matches.awayFirstPlayerId,
      awaySecondPlayerId: matches.awaySecondPlayerId,
      matchAt: matches.matchAt,
      matchDate: matches.matchDate,
      matchTime: matches.matchTime,
      matchStatus: matches.matchStatus,
      matchType: matches.matchType,
      matchRound: matches.matchRound,
      gameDay: matches.gameDay,
      matchTable: matches.matchTable,
      trackingActive: matches.trackingActive,
      trackingStartedAt: matches.trackingStartedAt,
      trackingFinishedAt: matches.trackingFinishedAt,
      trackingData: matches.trackingData,
      isDelayed: matches.isDelayed,
      delayedRound: matches.delayedRound,
      delayedGameDay: matches.delayedGameDay,
      delayedDate: matches.delayedDate,
      delayedTime: matches.delayedTime,
      delayedTable: matches.delayedTable,
      createdAt: matches.createdAt,
      updatedAt: matches.updatedAt
    },
    homeTeam: homeTeams,
    awayTeam: awayTeams,
    homeTeamBestPlayer: homeMvp,
    awayTeamBestPlayer: awayMvp,
    homeFirstPlayer: homeFirstPlayer,
    homeSecondPlayer: homeSecondPlayer,
    awayFirstPlayer: awayFirstPlayer,
    awaySecondPlayer: awaySecondPlayer,
    league: leagues
  })
  .from(matches)
  .leftJoin(leagues, eq(matches.leagueId, leagues.id))
  .leftJoin(homeTeams, eq(matches.homeTeamId, homeTeams.id))
  .leftJoin(awayTeams, eq(matches.awayTeamId, awayTeams.id))
  .leftJoin(homeMvp, eq(matches.homeTeamBestPlayerId, homeMvp.id))
  .leftJoin(awayMvp, eq(matches.awayTeamBestPlayerId, awayMvp.id))
  .leftJoin(homeFirstPlayer, eq(matches.homeFirstPlayerId, homeFirstPlayer.id))
  .leftJoin(homeSecondPlayer, eq(matches.homeSecondPlayerId, homeSecondPlayer.id))
  .leftJoin(awayFirstPlayer, eq(matches.awayFirstPlayerId, awayFirstPlayer.id))
  .leftJoin(awaySecondPlayer, eq(matches.awaySecondPlayerId, awaySecondPlayer.id))
  .where(
    and(
      or(eq(matches.homeTeamId, teamId), eq(matches.awayTeamId, teamId)),
      inArray(matches.leagueId, leagueIdsForTeam)
    )
  )
  .orderBy(asc(matches.matchAt), asc(matches.matchTable));

  return teamMatches;
}

export async function getMatchById(matchId: string) {
  const homeTeams = alias(teams, 'home_teams');
  const awayTeams = alias(teams, 'away_teams');
  const homeMvp = alias(players, 'home_mvp');
  const awayMvp = alias(players, 'away_mvp');

  const [match] = await db.select({
    match: matches,
    homeTeam: homeTeams,
    awayTeam: awayTeams,
    homeTeamBestPlayer: homeMvp,
    awayTeamBestPlayer: awayMvp
  })
  .from(matches)
  .leftJoin(homeTeams, eq(matches.homeTeamId, homeTeams.id))
  .leftJoin(awayTeams, eq(matches.awayTeamId, awayTeams.id))
  .leftJoin(homeMvp, eq(matches.homeTeamBestPlayerId, homeMvp.id))
  .leftJoin(awayMvp, eq(matches.awayTeamBestPlayerId, awayMvp.id))
  .where(eq(matches.id, matchId));

  if (!match) {
    throw new Error('Match not found');
  }

  return match;
}

export async function updateMatchResult(matchId: string, result: MatchResult) {
  const [match] = await db.select().from(matches).where(eq(matches.id, matchId));
  if (!match) {
    throw new Error('Match not found');
  }

  // If MVP players are specified, check if they exist
  if (result.homeTeamBestPlayerId) {
    const [player] = await db.select().from(players).where(eq(players.id, result.homeTeamBestPlayerId));
    if (!player) {
      throw new Error('Home team MVP player not found');
    }
  }

  if (result.awayTeamBestPlayerId) {
    const [player] = await db.select().from(players).where(eq(players.id, result.awayTeamBestPlayerId));
    if (!player) {
      throw new Error('Away team MVP player not found');
    }
  }

  // Update match with result
  const [updatedMatch] = await db.update(matches)
    .set({
      homeTeamScore: result.homeTeamScore,
      awayTeamScore: result.awayTeamScore,
      homeTeamBestPlayerId: result.homeTeamBestPlayerId,
      awayTeamBestPlayerId: result.awayTeamBestPlayerId,
      homeFirstPlayerId: result.homeFirstPlayerId,
      homeSecondPlayerId: result.homeSecondPlayerId,
      awayFirstPlayerId: result.awayFirstPlayerId,
      awaySecondPlayerId: result.awaySecondPlayerId,
      trackingData: result.trackingData,
      matchStatus: 'completed'
    })
    .where(eq(matches.id, matchId))
    .returning();

  return updatedMatch;
}

export async function updateMatchStatus(matchId: string, status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled') {
  const [match] = await db.select().from(matches).where(eq(matches.id, matchId));
  if (!match) {
    throw new Error('Match not found');
  }

  const [updatedMatch] = await db.update(matches)
    .set({ matchStatus: status })
    .where(eq(matches.id, matchId))
    .returning();

  return updatedMatch;
} 

export async function getMatchesFiltered(opts: { seasonId?: string; leagueId?: string; round?: number; page?: number; pageSize?: number; delayedOnly?: boolean }) {
  const page = Number(opts.page) >= 1 ? Number(opts.page) : 1;
  const pageSize = Number(opts.pageSize) >= 1 ? Number(opts.pageSize) : 20;
  const offset = (page - 1) * pageSize;

  const filters: any[] = [];
  if (opts.leagueId) filters.push(eq(matches.leagueId, opts.leagueId));
  if (typeof opts.round === 'number') filters.push(eq(matches.matchRound, opts.round));
  if (opts.seasonId) filters.push(eq(leagues.seasonId, opts.seasonId));
  if (opts.delayedOnly) filters.push(eq(matches.isDelayed, true));

  const homeTeams = alias(teams, 'home_teams');
  const awayTeams = alias(teams, 'away_teams');
  const homeMvp = alias(players, 'home_mvp');
  const awayMvp = alias(players, 'away_mvp');
  const homeFirstPlayer = alias(players, 'home_first_player');
  const homeSecondPlayer = alias(players, 'home_second_player');
  const awayFirstPlayer = alias(players, 'away_first_player');
  const awaySecondPlayer = alias(players, 'away_second_player');

  const whereApplied = filters.length > 0 ? and(...filters) : undefined as any;

  const totalRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(matches)
    .leftJoin(leagues, eq(matches.leagueId, leagues.id))
    .where(whereApplied as any);
  const total = Number(totalRows?.[0]?.count || 0);

  // grouped counts by status for full filtered set
  const grouped = await db
    .select({ status: matches.matchStatus, count: sql<number>`count(*)` })
    .from(matches)
    .leftJoin(leagues, eq(matches.leagueId, leagues.id))
    .where(whereApplied as any)
    .groupBy(matches.matchStatus);
  let completed = 0;
  let scheduled = 0;
  let inProgress = 0;
  let cancelled = 0;
  for (const row of grouped as any[]) {
    const st = String(row.status);
    const c = Number(row.count || 0);
    if (st === 'completed') completed += c;
    else if (st === 'scheduled') scheduled += c;
    else if (st === 'in_progress') inProgress += c;
    else if (st === 'cancelled') cancelled += c;
  }
  const counts = {
    total,
    completed,
    pending: scheduled + inProgress,
    cancelled,
    scheduled,
    in_progress: inProgress,
  } as const;

  const items = await db
    .select({
      match: {
        id: matches.id,
        leagueId: matches.leagueId,
        teamId: matches.teamId,
        homeTeamId: matches.homeTeamId,
        awayTeamId: matches.awayTeamId,
        homeLeagueTeamId: matches.homeLeagueTeamId,
        awayLeagueTeamId: matches.awayLeagueTeamId,
        homeTeamScore: matches.homeTeamScore,
        awayTeamScore: matches.awayTeamScore,
        homeTeamBestPlayerId: matches.homeTeamBestPlayerId,
        awayTeamBestPlayerId: matches.awayTeamBestPlayerId,
        homeFirstPlayerId: matches.homeFirstPlayerId,
        homeSecondPlayerId: matches.homeSecondPlayerId,
        awayFirstPlayerId: matches.awayFirstPlayerId,
        awaySecondPlayerId: matches.awaySecondPlayerId,
        matchAt: matches.matchAt,
        matchDate: matches.matchDate,
        matchTime: matches.matchTime,
        matchStatus: matches.matchStatus,
        matchType: matches.matchType,
        matchRound: matches.matchRound,
        gameDay: matches.gameDay,
        matchTable: matches.matchTable,
        trackingActive: matches.trackingActive,
        trackingStartedAt: matches.trackingStartedAt,
        trackingFinishedAt: matches.trackingFinishedAt,
        trackingData: matches.trackingData,
        isDelayed: matches.isDelayed,
        delayedRound: matches.delayedRound,
        delayedGameDay: matches.delayedGameDay,
        delayedDate: matches.delayedDate,
        delayedTime: matches.delayedTime,
        delayedTable: matches.delayedTable,
        createdAt: matches.createdAt,
        updatedAt: matches.updatedAt
      },
      homeTeam: homeTeams,
      awayTeam: awayTeams,
      homeTeamBestPlayer: homeMvp,
      awayTeamBestPlayer: awayMvp,
      homeFirstPlayer: homeFirstPlayer,
      homeSecondPlayer: homeSecondPlayer,
      awayFirstPlayer: awayFirstPlayer,
      awaySecondPlayer: awaySecondPlayer
    })
    .from(matches)
    .leftJoin(leagues, eq(matches.leagueId, leagues.id))
    .leftJoin(homeTeams, eq(matches.homeTeamId, homeTeams.id))
    .leftJoin(awayTeams, eq(matches.awayTeamId, awayTeams.id))
    .leftJoin(homeMvp, eq(matches.homeTeamBestPlayerId, homeMvp.id))
    .leftJoin(awayMvp, eq(matches.awayTeamBestPlayerId, awayMvp.id))
    .leftJoin(homeFirstPlayer, eq(matches.homeFirstPlayerId, homeFirstPlayer.id))
    .leftJoin(homeSecondPlayer, eq(matches.homeSecondPlayerId, homeSecondPlayer.id))
    .leftJoin(awayFirstPlayer, eq(matches.awayFirstPlayerId, awayFirstPlayer.id))
    .leftJoin(awaySecondPlayer, eq(matches.awaySecondPlayerId, awaySecondPlayer.id))
    .where(whereApplied as any)
    .orderBy(asc(matches.matchAt), asc(matches.matchTable), asc(matches.id))
    .limit(pageSize)
    .offset(offset);

  return { items, total, page, pageSize, counts };
}

export async function getAvailableRoundsForLeague(leagueId: string) {
  // validate league exists
  const [league] = await db.select().from(leagues).where(eq(leagues.id, leagueId));
  if (!league) throw new Error('League not found');

  const rows = await db
    .select({ round: matches.matchRound })
    .from(matches)
    .where(eq(matches.leagueId, leagueId))
    .groupBy(matches.matchRound)
    .orderBy(asc(matches.matchRound));
  const rounds = rows
    .map((r: any) => Number(r.round))
    .filter((n) => Number.isFinite(n));
  return { rounds };
}

export async function updateMatchAdmin(
  matchId: string,
  data: {
    matchAt?: string;
    matchRound?: number;
    gameDay?: number;
    matchTable?: number;
    matchStatus?: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
    isDelayed?: boolean;
    delayedRound?: number;
    delayedGameDay?: number;
    delayedDate?: string;
    delayedTime?: string;
    delayedTable?: number;
  }
) {
  const [existing] = await db.select().from(matches).where(eq(matches.id, matchId));
  if (!existing) throw new Error('Match not found');

  const update: any = {};
  if (data.matchAt) {
    // Handle ISO string from frontend
    const at = new Date(data.matchAt);
    if (Number.isNaN(at.getTime())) throw new Error('Invalid matchAt');
    update.matchAt = at;
    update.matchDate = at;
    update.matchTime = at;
  }
  if (typeof data.matchRound === 'number') update.matchRound = data.matchRound;
  if (typeof data.gameDay === 'number') update.gameDay = data.gameDay;
  if (typeof data.matchTable === 'number') update.matchTable = data.matchTable;
  if (data.matchStatus) update.matchStatus = data.matchStatus;
  
  // Delay fields
  if (typeof data.isDelayed === 'boolean') update.isDelayed = data.isDelayed;
  if (typeof data.delayedRound === 'number') update.delayedRound = data.delayedRound;
  if (typeof data.delayedGameDay === 'number') update.delayedGameDay = data.delayedGameDay;
  if (data.delayedDate) {
    // Handle ISO string from frontend
    const delayedDate = new Date(data.delayedDate);
    if (Number.isNaN(delayedDate.getTime())) throw new Error('Invalid delayedDate');
    update.delayedDate = delayedDate;
  }
  if (data.delayedTime) {
    // Handle ISO string from frontend
    const delayedTime = new Date(data.delayedTime);
    if (Number.isNaN(delayedTime.getTime())) throw new Error('Invalid delayedTime');
    update.delayedTime = delayedTime;
  }
  if (typeof data.delayedTable === 'number') update.delayedTable = data.delayedTable;

  if (Object.keys(update).length === 0) return existing;

  const [updated] = await db.update(matches)
    .set(update)
    .where(eq(matches.id, matchId))
    .returning();
  return updated;
}