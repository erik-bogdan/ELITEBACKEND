import { db } from '../../db';
import { matches, leagues, teams, players } from '../../database/schema';
import { eq, and, asc } from 'drizzle-orm';
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

export async function getMatchById(matchId: string) {
  const [match] = await db.select({
    match: matches,
    homeTeam: teams,
    awayTeam: teams,
    homeTeamBestPlayer: players,
    awayTeamBestPlayer: players
  })
  .from(matches)
  .leftJoin(teams, eq(matches.homeTeamId, teams.id))
  .leftJoin(teams, eq(matches.awayTeamId, teams.id))
  .leftJoin(players, eq(matches.homeTeamBestPlayerId, players.id))
  .leftJoin(players, eq(matches.awayTeamBestPlayerId, players.id))
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