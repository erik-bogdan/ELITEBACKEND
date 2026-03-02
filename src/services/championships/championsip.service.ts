import { db } from '../../db';
import { leagues, teams, leagueTeams, seasons, teamPlayers, matches, players } from '../../database/schema';
import { eq, and, inArray, ne, sql, gte, lt, asc, lte, desc } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

export type Match = {
  home: string;
  away: string;
  day?: number;
  table?: number;
  startTime?: string;
  slot?: number;
  absoluteMinutes?: number;
  globalOrder?: number;
  round?: number;
};

export interface SchedulerInput {
  teams: string[];
  matchesPerDay: number[];
  startTime?: string;    
  matchDuration?: number; 
  tables?: number;
}

/**
 * Copy team_players from the most recent previous season (where this team had players) into the new season.
 * So when adding a team to a new season's league, the same players are linked to the same team for the new season.
 * Returns the number of player links copied.
 */
export async function copyTeamPlayersFromPreviousSeason(teamId: string, newSeasonId: string): Promise<number> {
  // Find the most recent season (by createdAt) where this team had at least one team_player, excluding newSeasonId
  const previousSeasonsWithTeam = await db
    .select({ seasonId: teamPlayers.seasonId })
    .from(teamPlayers)
    .innerJoin(seasons, eq(teamPlayers.seasonId, seasons.id))
    .where(and(eq(teamPlayers.teamId, teamId), ne(teamPlayers.seasonId, newSeasonId)))
    .groupBy(teamPlayers.seasonId, seasons.createdAt)
    .orderBy(desc(seasons.createdAt))
    .limit(1);

  if (previousSeasonsWithTeam.length === 0) return 0;

  const prevSeasonId = previousSeasonsWithTeam[0].seasonId;

  const previousRoster = await db
    .select({ playerId: teamPlayers.playerId, captain: teamPlayers.captain })
    .from(teamPlayers)
    .where(and(eq(teamPlayers.teamId, teamId), eq(teamPlayers.seasonId, prevSeasonId)));

  if (previousRoster.length === 0) return 0;

  let copied = 0;
  let captainCopied = false;
  for (const row of previousRoster) {
    const existing = await db
      .select()
      .from(teamPlayers)
      .where(and(
        eq(teamPlayers.teamId, teamId),
        eq(teamPlayers.playerId, row.playerId),
        eq(teamPlayers.seasonId, newSeasonId)
      ));
    if (existing.length > 0) continue;
    // Only one captain per team per season: use the first captain from previous roster
    const setCaptain = row.captain && !captainCopied;
    if (setCaptain) captainCopied = true;
    await db.insert(teamPlayers).values({
      teamId,
      playerId: row.playerId,
      seasonId: newSeasonId,
      captain: setCaptain
    });
    copied++;
  }
  return copied;
}

// Championship (League) management functions
export async function addTeamToLeague(leagueId: string, teamId: string): Promise<void> {
  // Check if league exists
  const [league] = await db.select().from(leagues).where(eq(leagues.id, leagueId));
  if (!league) {
    throw new Error('League not found');
  }

  // Check if team exists
  const [team] = await db.select().from(teams).where(eq(teams.id, teamId));
  if (!team) {
    throw new Error('Team not found');
  }

  // Check if team is already in the league
  const [existingTeam] = await db.select()
    .from(leagueTeams)
    .where(
      and(
        eq(leagueTeams.leagueId, leagueId),
        eq(leagueTeams.teamId, teamId)
      )
    );

  if (existingTeam) {
    throw new Error('Team is already in this league');
  }

  // Add team to league
  await db.insert(leagueTeams).values({
    leagueId,
    teamId,
    status: 'pending'
  });

  // Copy team_players from the most recent previous season for this team into the new season (league's season)
  await copyTeamPlayersFromPreviousSeason(teamId, league.seasonId as string);
}

export async function removeTeamFromLeague(leagueId: string, teamId: string): Promise<void> {
  // Check if league exists
  const [league] = await db.select().from(leagues).where(eq(leagues.id, leagueId));
  if (!league) {
    throw new Error('League not found');
  }

  // Check if team exists
  const [team] = await db.select().from(teams).where(eq(teams.id, teamId));
  if (!team) {
    throw new Error('Team not found');
  }

  // Remove team from league
  await db.delete(leagueTeams)
    .where(
      and(
        eq(leagueTeams.leagueId, leagueId),
        eq(leagueTeams.teamId, teamId)
      )
    );
}

export async function getLeagueTeams(leagueId: string): Promise<Array<typeof teams.$inferSelect & { _status?: string; _playersCount?: number }>> {
  // Check if league exists
  const [league] = await db.select().from(leagues).where(eq(leagues.id, leagueId));
  if (!league) {
    throw new Error('League not found');
  }

  // Get all teams in the league with status
  const leagueTeamRelations = await db.select({ teamId: leagueTeams.teamId, status: leagueTeams.status, inviteSent: leagueTeams.inviteSent, inviteSentDate: leagueTeams.inviteSentDate, leagueTeamId: leagueTeams.id, heir: leagueTeams.heir })
    .from(leagueTeams)
    .where(eq(leagueTeams.leagueId, leagueId));

  const teamIds = leagueTeamRelations.map(lt => lt.teamId);
  
  if (teamIds.length === 0) {
    return [] as any;
  }

  const list = await db.select().from(teams).where(inArray(teams.id, teamIds));

  // Resolve heir team names for declined items
  const heirIds = Array.from(new Set(leagueTeamRelations.map(r => r.heir).filter(Boolean) as string[]));
  const heirTeams = heirIds.length > 0 ? await db.select().from(teams).where(inArray(teams.id, heirIds)) : [];
  const heirIdToName = new Map<string, string>();
  for (const ht of heirTeams as any[]) heirIdToName.set(ht.id as string, ht.name as string);

  // players count per team for this season
  const counts = await db
    .select({ teamId: teamPlayers.teamId, count: sql<number>`count(*)` })
    .from(teamPlayers)
    .where(eq(teamPlayers.seasonId, league.seasonId))
    .groupBy(teamPlayers.teamId);
  const teamIdToCount = new Map<string, number>();
  for (const c of counts as any[]) {
    teamIdToCount.set(c.teamId, Number(c.count));
  }

  // attach status and players count
  return (list as any[]).map(t => ({
    ...t,
    _status: leagueTeamRelations.find(r => r.teamId === t.id)?.status,
    _inviteSent: leagueTeamRelations.find(r => r.teamId === t.id)?.inviteSent,
    _inviteSentDate: leagueTeamRelations.find(r => r.teamId === t.id)?.inviteSentDate,
    _leagueTeamId: leagueTeamRelations.find(r => r.teamId === t.id)?.leagueTeamId,
    _heirTeamName: (() => { const h = leagueTeamRelations.find(r => r.teamId === t.id)?.heir as string | undefined; return h ? (heirIdToName.get(h) || null) : null; })(),
    _playersCount: teamIdToCount.get(t.id as string) || 0,
  }));
}

export async function getAvailableTeamsForLeague(leagueId: string): Promise<typeof teams.$inferSelect[]> {
  // Ensure league exists
  const [league] = await db.select().from(leagues).where(eq(leagues.id, leagueId));
  if (!league) throw new Error('League not found');

  // Find already attached team ids
  const leagueTeamRelations = await db.select().from(leagueTeams).where(eq(leagueTeams.leagueId, leagueId));
  const attachedIds = leagueTeamRelations.map(lt => lt.teamId);

  // Return all teams not in the attached list
  if (attachedIds.length === 0) {
    return await db.select().from(teams);
  }
  // teams not in attachedIds
  const all = await db.select().from(teams);
  return all.filter(t => !attachedIds.includes(t.id as string));
}

// Existing schedule generation functions
export function generateSchedule({
  teams,
  matchesPerDay,
  startTime = "08:00",
  matchDuration = 40,
  tables = 6
}: SchedulerInput): Match[] {
  if (teams.length < 2) throw new Error("Minimum 2 csapat kell.");

  const maxTables = Math.floor(teams.length / 2);
  if (tables > maxTables) {
    throw new Error(`Túl sok asztal (${tables}). Maximum ${maxTables} asztal lehet a ${teams.length} csapathoz.`);
  }

  const randomizedTeams = shuffleArray(teams);
  const roundRobinMatches = roundRobin(randomizedTeams);
  const allMatches = [...roundRobinMatches, ...roundRobinMatches.map(m => ({ home: m.away, away: m.home }))];

  const fullSchedule: Match[] = [];
  let matchIndex = 0;
  let globalOrder = 0;
  let roundOffset = 0; // ensure continuous rounds across days

  const [startHour, startMinute] = startTime.split(':').map(Number);
  const startMinutes = startHour * 60 + startMinute;

  for (let day = 0; day < matchesPerDay.length; day++) {
    const matchesForThisDay = (matchesPerDay[day] * teams.length) / 2;
    const dayMatches = allMatches.slice(matchIndex, matchIndex + matchesForThisDay);
    matchIndex += matchesForThisDay;

    // number of parallel slots (rounds) for this day
    const slotsForDay = Math.ceil(dayMatches.length / tables);
    const scheduled = scheduleDay(dayMatches, startMinutes, matchDuration, tables, day + 1, globalOrder, roundOffset);
    fullSchedule.push(...scheduled);
    globalOrder += dayMatches.length;
    roundOffset += slotsForDay;
  }

  return fullSchedule;
}

function roundRobin(teams: string[]): Match[] {
  const list = [...teams];
  if (list.length % 2 !== 0) list.push("BYE");

  const totalRounds = list.length - 1;
  const halfSize = list.length / 2;
  const rounds: Match[][] = [];

  for (let round = 0; round < totalRounds; round++) {
    const pairings: Match[] = [];

    for (let i = 0; i < halfSize; i++) {
      const home = list[i];
      const away = list[list.length - 1 - i];
      if (home !== "BYE" && away !== "BYE") {
        pairings.push({ home, away });
      }
    }

    rounds.push(pairings);
    list.splice(1, 0, list.pop()!);
  }

  const shuffledRounds = shuffleArray(rounds);
  return shuffledRounds.flat();
}

function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function scheduleDay(
  matches: Match[],
  startMinutes: number,
  matchDuration: number,
  tables: number,
  day: number,
  globalCounterOffset: number,
  roundOffset: number
): Match[] {
  const slots = Math.ceil(matches.length / tables);
  const scheduled: Match[] = [];
  let matchIndex = 0;
  let globalCounter = globalCounterOffset;

  for (let slot = 0; slot < slots; slot++) {
    for (let table = 0; table < tables; table++) {
      if (matchIndex >= matches.length) break;

      const match = matches[matchIndex++];
      const absoluteMinutes = startMinutes + slot * matchDuration;

      scheduled.push({
        ...match,
        day,
        table: table + 1,
        slot,
        round: roundOffset + slot + 1,
        startTime: formatTime(absoluteMinutes),
        absoluteMinutes,
        globalOrder: globalCounter++
      });
    }
  }
  return scheduled;
}

function formatTime(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

export function printSchedule(schedule: Match[]) {
  schedule.sort((a, b) => a.globalOrder! - b.globalOrder!);

  let currentDay: number | undefined = undefined;
  for (const match of schedule) {
    if (match.day !== currentDay) {
      console.log(`=== Game Day ${match.day} ===`);
      currentDay = match.day;
    }
    console.log(
      `${match.globalOrder}  ${match.startTime} - ${match.home} vs ${match.away} - table: ${match.table}`
    );
  }
}

export async function createChampionship(data: {
  seasonId: string;
  name: string;
  subName?: string;
  description?: string;
  logo?: string;
  slug: string;
  properties?: {
    type: 'league';
    rounds: number;
    hasPlayoff: boolean;
    playoffType?: 'groupped' | 'knockout' | string;
    teams: number;
    // optional day config
    gameDays?: any[];
    elimination?: number;
    registrationClose?: string;
    regfee?: string;
    regfeeDueDate?: string;
    // New prize fields
    nyeremeny_text?: string;
    nyeremeny_value?: string;
    masodik_nyeremeny_text?: string;
    masodik_nyeremeny_value?: string;
  };
}): Promise<typeof leagues.$inferSelect> {
  const [championship] = await db.insert(leagues)
    .values({
      seasonId: data.seasonId,
      name: data.name,
      subName: data.subName,
      description: data.description,
      logo: data.logo,
      slug: data.slug,
      properties: data.properties,
      isActive: true,
      isArchived: false
    })
    .returning();

  return championship;
}

export interface StandingsOptions {
  date?: string;
  gameDay?: number;
  uptoGameDay?: number;
  uptoRound?: number;
  teamIds?: string[];
  includePlayoffMatches?: boolean;
  includeCrossMatches?: boolean;
}

export async function computeStandings(leagueId: string, opts?: StandingsOptions) {
  // Fetch teams attached to this league
  const leagueTeamRows = await db.select({ teamId: leagueTeams.teamId })
    .from(leagueTeams)
    .where(eq(leagueTeams.leagueId, leagueId));
  const leagueTeamIds = leagueTeamRows.map(r => r.teamId);
  const allTeams = leagueTeamIds.length ? await db.select().from(teams).where(inArray(teams.id, leagueTeamIds)) : [];
  const teamInfoMap = new Map<string, typeof teams.$inferSelect>();
  for (const t of allTeams as any[]) teamInfoMap.set(t.id, t);
  const requestedTeamIds = Array.isArray(opts?.teamIds) && opts.teamIds.length > 0 ? new Set(opts.teamIds) : null;
  const targetTeamIds = requestedTeamIds
    ? leagueTeamIds.filter(id => requestedTeamIds.has(id))
    : leagueTeamIds;
  const teamList = targetTeamIds.length ? allTeams.filter(t => targetTeamIds.includes(t.id as string)) : [];

  // Initialize map
  type Row = {
    teamId: string;
    name: string;
    logo?: string | null;
    games: number;
    winsTotal: number;
    winsRegular: number;
    winsOT: number;
    lossesTotal: number;
    lossesOT: number;
    lossesRegular: number;
    cupDiff: number;
    points: number;
    form: string[];
    recentMatches: Array<{
      opponent: string;
      opponentLogo?: string | null;
      result: string;
      score: string;
      date: string;
      gameDay?: number;
    }>;
  };
  const byTeam = new Map<string, Row>();
  for (const t of teamList as any[]) {
    byTeam.set(t.id, {
      teamId: t.id,
      name: t.name,
      logo: t.logo,
      games: 0,
      winsTotal: 0,
      winsRegular: 0,
      winsOT: 0,
      lossesTotal: 0,
      lossesOT: 0,
      lossesRegular: 0,
      cupDiff: 0,
      points: 0,
      form: [],
      recentMatches: [],
    });
  }

  // Get completed matches for league
  const filters: any[] = [eq(matches.leagueId, leagueId), eq(matches.matchStatus, 'completed')];
  if (!opts?.includePlayoffMatches) {
    filters.push(eq(matches.isPlayoffMatch, false));
  }
  if (typeof opts?.gameDay === 'number') {
    // Only use original gameDay, not delayedGameDay
    // When filtering by gameDay, we only want matches that were originally scheduled for that gameDay
    filters.push(eq(matches.gameDay, opts.gameDay));
  }
  if (typeof opts?.uptoGameDay === 'number') {
    // Use delayedGameDay if available, otherwise use gameDay
    filters.push(
      sql`COALESCE(${matches.delayedGameDay}, ${matches.gameDay}) <= ${opts.uptoGameDay}`
    );
  }
  if (typeof opts?.uptoRound === 'number') {
    filters.push(lte(matches.matchRound, opts.uptoRound));
  }
  if (opts?.date) {
    const dayStart = new Date(opts.date + 'T00:00:00');
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    filters.push(gte(matches.matchAt, dayStart));
    filters.push(lt(matches.matchAt, dayEnd));
  }
  const played = await db.select().from(matches).where(and(...filters));

  // Sort matches by date to calculate form correctly
  const sortedMatches = (played as any[]).sort((a, b) => 
    new Date(a.matchAt || a.matchDate).getTime() - new Date(b.matchAt || b.matchDate).getTime()
  );

  for (const m of sortedMatches) {
    const homeId = m.homeTeamId as string;
    const awayId = m.awayTeamId as string;
    const homeScore = Number(m.homeTeamScore || 0);
    const awayScore = Number(m.awayTeamScore || 0);
    const hasHome = byTeam.has(homeId);
    const hasAway = byTeam.has(awayId);
    if (!hasHome && !hasAway) continue;
    if (!opts?.includeCrossMatches && (!hasHome || !hasAway)) continue;

    const home = hasHome ? byTeam.get(homeId)! : null;
    const away = hasAway ? byTeam.get(awayId)! : null;
    if (home) home.games += 1;
    if (away) away.games += 1;

    // Add match details to recent matches
    const matchDate = new Date(m.matchAt || m.matchDate).toLocaleDateString('hu-HU');
    const homeResult = homeScore > awayScore ? 'W' : 'L';
    const awayResult = awayScore > homeScore ? 'W' : 'L';
    
    const awayInfo = teamInfoMap.get(awayId);
    const homeInfo = teamInfoMap.get(homeId);
    if (home) {
      home.recentMatches.push({
        opponent: awayInfo?.name || awayId,
        opponentLogo: awayInfo?.logo || null,
        result: homeResult,
        score: `${homeScore}-${awayScore}`,
        date: matchDate,
        gameDay: m.gameDay
      });
    }

    if (away) {
      away.recentMatches.push({
        opponent: homeInfo?.name || homeId,
        opponentLogo: homeInfo?.logo || null,
        result: awayResult,
        score: `${awayScore}-${homeScore}`,
        date: matchDate,
        gameDay: m.gameDay
      });
    }

    // Cup difference rule
    const maxScore = Math.max(homeScore, awayScore);
    const minScore = Math.min(homeScore, awayScore);
    const overtime = (maxScore > 10 && minScore >= 10);
    const capCupDiff = (maxScore > 13);
    const diff = capCupDiff ? 1 : Math.abs(homeScore - awayScore);

    if (homeScore === awayScore) continue;
    const homeWon = homeScore > awayScore;
    const applyWin = (team?: Row | null) => {
      if (!team) return;
      team.winsTotal += 1;
      if (overtime) { team.winsOT += 1; team.points += 2; }
      else { team.winsRegular += 1; team.points += 3; }
      team.cupDiff += diff;
      team.form.push('W');
    };
    const applyLoss = (team?: Row | null) => {
      if (!team) return;
      if (overtime) { team.lossesOT += 1; team.points += 1; }
      else { team.lossesRegular += 1; }
      team.cupDiff -= diff;
      team.form.push('L');
    };

    if (homeWon) {
      applyWin(home);
      applyLoss(away);
    } else {
      applyWin(away);
      applyLoss(home);
    }
  }

  // derive totals
  for (const row of byTeam.values()) {
    row.lossesTotal = row.lossesOT + row.lossesRegular;
  }

  // Sort per criteria: points desc, winsTotal desc, cupDiff desc, winsRegular desc, name asc
  const list: Row[] = Array.from(byTeam.values()).sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.winsTotal !== a.winsTotal) return b.winsTotal - a.winsTotal;
    if (b.cupDiff !== a.cupDiff) return b.cupDiff - a.cupDiff;
    if (b.winsRegular !== a.winsRegular) return b.winsRegular - a.winsRegular;
    return a.name.localeCompare(b.name);
  });

  // Rank and ensure totals explicitly computed in payload
  return list.map((row, idx) => ({
    rank: idx + 1,
    ...row,
    lossesTotal: row.lossesOT + row.lossesRegular,
  }));
}

export async function computeGroupedPlayoffTables(leagueId: string) {
  const [league] = await db.select().from(leagues).where(eq(leagues.id, leagueId));
  if (!league) throw new Error('League not found');

  const props = (league.properties || {}) as any;
  const enabled = Boolean(props?.hasPlayoff && props?.playoffType === 'groupped');
  const baseResponse = {
    enabled,
    ready: false,
    totalTeams: 0,
    upper: null as null | { label: 'upper'; name: string; teamIds: string[]; standings: any[] },
    lower: null as null | { label: 'lower'; name: string; teamIds: string[]; standings: any[] },
  };
  if (!enabled) {
    return baseResponse;
  }

  const standings = await computeStandings(leagueId);
  const totalTeams = standings.length;
  if (totalTeams === 0) {
    return { ...baseResponse, totalTeams: 0 };
  }

  const [regularAgg] = await db
    .select({
      total: sql<number>`count(*)`,
      completed: sql<number>`sum(case when ${matches.matchStatus} = 'completed' then 1 else 0 end)`
    })
    .from(matches)
    .where(and(eq(matches.leagueId, leagueId), eq(matches.isPlayoffMatch, false)));
  const totalRegular = Number(regularAgg?.total || 0);
  const completedRegular = Number(regularAgg?.completed || 0);
  const ready = totalRegular > 0 && totalRegular === completedRegular;

  const midpoint = Math.ceil(totalTeams / 2);
  const upperSeeds = standings.slice(0, midpoint);
  const lowerSeeds = standings.slice(midpoint);
  const upperTeamIds = upperSeeds.map((row: any) => row.teamId);
  const lowerTeamIds = lowerSeeds.map((row: any) => row.teamId);

  const upperStandings = upperTeamIds.length > 0
    ? await computeStandings(leagueId, { teamIds: upperTeamIds, includePlayoffMatches: true, includeCrossMatches: true })
    : [];
  const lowerStandings = lowerTeamIds.length > 0
    ? await computeStandings(leagueId, { teamIds: lowerTeamIds, includePlayoffMatches: true, includeCrossMatches: true })
    : [];

  return {
    enabled,
    ready,
    totalTeams,
    upper: upperTeamIds.length ? { label: 'upper', name: 'Felső ház', teamIds: upperTeamIds, standings: upperStandings } : null,
    lower: lowerTeamIds.length ? { label: 'lower', name: 'Alsó ház', teamIds: lowerTeamIds, standings: lowerStandings } : null,
  };
}

type HouseLabel = 'upper' | 'lower';

type HouseTeam = { id: string; name: string };

type HousePair = { home: HouseTeam; away: HouseTeam };

type PlayoffScheduleConfig = {
  startTime: string;
  matchDuration: number;
  tables: number;
  gameDayDate?: string;
};

export type GroupedPlayoffScheduleItem = {
  id: string;
  house: HouseLabel;
  houseLabel: string;
  houseRound: number;
  day: number;
  round: number;
  table: number;
  startTime: string;
  date?: string | null;
  dateTime?: string | null;
  homeId: string;
  homeName: string;
  awayId: string;
  awayName: string;
  globalOrder: number;
};

function ensureHouseTeams(label: string, standings?: any[]): HouseTeam[] {
  if (!standings || standings.length === 0) {
    throw new Error(`${label} házhoz nincs elegendő csapat`);
  }
  const shuffled = [...standings].sort(() => Math.random() - 0.5);
  return shuffled.map((row: any) => ({
    id: String(row.teamId),
    name: String(row.name),
  }));
}

function createDoubleRoundRobin(teams: HouseTeam[]): HousePair[][] {
  if (teams.length < 2) {
    throw new Error('Legalább két csapat szükséges a házon belüli mérkőzésekhez');
  }
  const BYE_ID = '__BYE__';
  const data: HouseTeam[] = [...teams];
  if (data.length % 2 !== 0) {
    data.push({ id: BYE_ID, name: 'BYE' });
  }
  const totalRounds = data.length - 1;
  const half = data.length / 2;
  const rounds: HousePair[][] = [];
  let rotation = [...data];

  for (let round = 0; round < totalRounds; round++) {
    const bucket: HousePair[] = [];
    for (let i = 0; i < half; i++) {
      const home = rotation[i];
      const away = rotation[rotation.length - 1 - i];
      if (home.id !== BYE_ID && away.id !== BYE_ID) {
        bucket.push({ home, away });
      }
    }
    rounds.push(bucket);
    const fixed = rotation[0];
    const rest = rotation.slice(1);
    rest.unshift(rest.pop()!);
    rotation = [fixed, ...rest];
  }

  const reverse = rounds.map((r) =>
    r.map(({ home, away }) => ({ home: away, away: home }))
  );

  return [...rounds, ...reverse];
}

function parseStartMinutes(startTime: string): number {
  const [h, m] = (startTime || '20:00').split(':').map((p) => Number(p));
  const hours = Number.isFinite(h) ? h : 20;
  const minutes = Number.isFinite(m) ? m : 0;
  return hours * 60 + minutes;
}

function pad(num: number): string {
  return String(num).padStart(2, '0');
}

function formatFromMinutes(minutes: number): string {
  const normalized = ((minutes % (24 * 60)) + (24 * 60)) % (24 * 60);
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${pad(h)}:${pad(m)}`;
}

function interleaveHouseRounds(upper: HousePair[][], lower: HousePair[][]): { house: HouseLabel; roundIndex: number }[] {
  const pattern: { house: HouseLabel; roundIndex: number }[] = [];
  let u = 0;
  let l = 0;
  while (u < upper.length || l < lower.length) {
    if (u < upper.length) {
      pattern.push({ house: 'upper', roundIndex: u });
      u += 1;
    }
    if (l < lower.length) {
      pattern.push({ house: 'lower', roundIndex: l });
      l += 1;
    }
  }
  return pattern;
}

export async function generateGroupedPlayoffSchedule(
  leagueId: string,
  config: PlayoffScheduleConfig
) {
  const groups = await computeGroupedPlayoffTables(leagueId);
  if (!groups.enabled) {
    throw new Error('Ehhez a bajnoksághoz nincs playoff csoportosítás engedélyezve');
  }
  if (!groups.ready) {
    throw new Error('A rájátszás csak az alapszakasz összes meccsének befejezése után indítható');
  }
  if (!groups.upper || !groups.lower) {
    throw new Error('Mindkét házhoz szükség van csapatokra a playoff sorsoláshoz');
  }

  const upperTeams = ensureHouseTeams('Felső', groups.upper.standings);
  const lowerTeams = ensureHouseTeams('Alsó', groups.lower.standings);

  const upperRounds = createDoubleRoundRobin(upperTeams);
  const lowerRounds = createDoubleRoundRobin(lowerTeams);

  const pattern = interleaveHouseRounds(upperRounds, lowerRounds);
  if (pattern.length === 0) {
    throw new Error('Nem sikerült playoff menetrendet generálni');
  }

  const tables = Math.max(1, Number(config.tables || 1));
  const duration = Math.max(5, Number(config.matchDuration || 20));
  const startMinutes = parseStartMinutes(config.startTime || '20:00');
  const entries: GroupedPlayoffScheduleItem[] = [];

  let globalOrder = 0;
  pattern.forEach(({ house, roundIndex }, idx) => {
    const roundMatches = (house === 'upper' ? upperRounds : lowerRounds)[roundIndex] || [];
    const totalMatches = roundMatches.length;
    const slots = Math.ceil(totalMatches / tables);
    const dayNumber = idx + 1;
    const dateValue = config.gameDayDate || null;

    for (let slot = 0; slot < slots; slot++) {
      const offsetMinutes = startMinutes + (idx * duration) + (slot * duration);
      const timeStr = formatFromMinutes(offsetMinutes);
      for (let tableIdx = 0; tableIdx < tables; tableIdx++) {
        const matchIdx = slot * tables + tableIdx;
        if (matchIdx >= roundMatches.length) break;
        const match = roundMatches[matchIdx];
        const id = `${house}-${dayNumber}-${matchIdx}`;
        const isoDateTime = dateValue ? `${dateValue}T${timeStr}:00` : null;
        entries.push({
          id,
          house,
          houseLabel: house === 'upper' ? 'Felső ház' : 'Alsó ház',
          houseRound: roundIndex + 1,
          day: dayNumber,
          round: dayNumber,
          table: tableIdx + 1,
          startTime: timeStr,
          date: dateValue,
          dateTime: isoDateTime,
          homeId: match.home.id,
          homeName: match.home.name,
          awayId: match.away.id,
          awayName: match.away.name,
          globalOrder: globalOrder++,
        });
      }
    }
  });

  return {
    schedule: entries,
    totalDays: pattern.length,
    pattern,
    groups: {
      upper: upperTeams,
      lower: lowerTeams,
    },
  };
}

export async function saveGroupedPlayoffSchedule(
  leagueId: string,
  schedule: GroupedPlayoffScheduleItem[]
) {
  if (!Array.isArray(schedule) || schedule.length === 0) {
    throw new Error('Hiányzó menetrend a mentéshez');
  }
  const [league] = await db.select().from(leagues).where(eq(leagues.id, leagueId));
  if (!league) throw new Error('League not found');

  const relations = await db.select().from(leagueTeams).where(eq(leagueTeams.leagueId, leagueId));
  const teamToLeagueTeam = new Map<string, string>();
  for (const rel of relations as any[]) {
    teamToLeagueTeam.set(String(rel.teamId), rel.id);
  }

  // Remove existing playoff matches before inserting new ones
  await db.delete(matches).where(and(eq(matches.leagueId, leagueId), eq(matches.isPlayoffMatch, true)));

  const maxRoundRows = await db
    .select({ maxRound: sql<number>`COALESCE(MAX(${matches.matchRound}), 0)` })
    .from(matches)
    .where(and(eq(matches.leagueId, leagueId), eq(matches.isPlayoffMatch, false)));
  const baseRound = Number(maxRoundRows?.[0]?.maxRound || 0);

  const rows = schedule.map((entry, idx) => {
    const homeId = String(entry.homeId);
    const awayId = String(entry.awayId);
    const homeLeagueTeamId = teamToLeagueTeam.get(homeId) || null;
    const awayLeagueTeamId = teamToLeagueTeam.get(awayId) || null;
    const roundNumber = baseRound + idx + 1;
    let matchAt: Date;
    if (entry.date && entry.startTime) {
      const iso = `${entry.date}T${entry.startTime}:00`;
      matchAt = new Date(iso);
    } else if (entry.startTime) {
      matchAt = new Date(`1970-01-01T${entry.startTime}:00`);
    } else {
      matchAt = new Date();
    }
    const matchDate = entry.date ? new Date(entry.date) : new Date(matchAt);
    const matchTime = new Date(`${entry.date ?? matchDate.toISOString().slice(0,10)}T${entry.startTime ?? matchAt.toISOString().slice(11,16)}:00`);
    return {
      leagueId,
      teamId: homeId,
      homeTeamId: homeId,
      awayTeamId: awayId,
      homeLeagueTeamId,
      awayLeagueTeamId,
      homeTeamScore: 0,
      awayTeamScore: 0,
      matchAt,
      matchDate,
      matchTime,
      matchStatus: 'scheduled',
      matchType: 'playoff',
      isPlayoffMatch: true,
      matchRound: roundNumber,
      gameDay: entry.day,
      matchTable: entry.table,
      trackingActive: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  });

  await db.insert(matches as any).values(rows as any);
  return rows.length;
}

export interface KnockoutPlayoffMatch {
  id: string;
  homeTeamId: string;
  homeTeamName: string;
  awayTeamId: string;
  awayTeamName: string;
  matchNumber: number; // 1, 2, 3... within the round
  knockoutRound: number; // 1=quarter, 2=semi, 3=final
  date?: string;
  time?: string;
}

export interface GenerateKnockoutPlayoffMatchesInput {
  leagueId: string;
  bestOf: number; // BO 7 = 4 wins needed
  matches: Array<{
    homeTeamId: string;
    awayTeamId: string;
    matchNumber: number;
    knockoutRound: number;
    date?: string;
    time?: string;
    table: number;
  }>;
}

export async function generateKnockoutPlayoffMatches(leagueId: string) {
  const [league] = await db.select().from(leagues).where(eq(leagues.id, leagueId));
  if (!league) throw new Error('League not found');

  const props = (league.properties || {}) as any;
  const hasKnockoutPlayoff = Boolean(props?.hasPlayoff && props?.playoffType === 'knockout');
  if (!hasKnockoutPlayoff) {
    throw new Error('Ehhez a bajnoksághoz nincs knockout playoff engedélyezve');
  }

  // Get BO number from properties or default to 7
  const bestOf = props?.knockoutBestOf || 7;
  const winsNeeded = Math.ceil(bestOf / 2);

  // Check if all regular matches are completed (only for round 1)
  const currentKnockoutRound = league.knockoutRound || 0;
  if (currentKnockoutRound === 0) {
    const [regularAgg] = await db
      .select({
        total: sql<number>`count(*)`,
        completed: sql<number>`sum(case when ${matches.matchStatus} = 'completed' then 1 else 0 end)`
      })
      .from(matches)
      .where(and(eq(matches.leagueId, leagueId), eq(matches.isPlayoffMatch, false)));
    const totalRegular = Number(regularAgg?.total || 0);
    const completedRegular = Number(regularAgg?.completed || 0);
    if (totalRegular === 0 || totalRegular !== completedRegular) {
      throw new Error('A knockout playoff csak az alapszakasz összes meccsének befejezése után indítható');
    }
  }

  // Get current standings
  const standings = await computeStandings(leagueId);
  if (standings.length < 8) {
    throw new Error('Legalább 8 csapat szükséges a knockout playoff-hoz');
  }

  let nextRound = currentKnockoutRound + 1;
  let matchups: Array<{ homeTeamId: string; homeTeamName: string; awayTeamId: string; awayTeamName: string }> = [];

  if (nextRound === 1) {
    // Quarterfinals: 1-8, 4-5, 3-6, 7-2
    const seeds = [1, 8, 4, 5, 3, 6, 7, 2];
    for (let i = 0; i < seeds.length; i += 2) {
      const homeSeed = seeds[i];
      const awaySeed = seeds[i + 1];
      const homeTeam = standings[homeSeed - 1];
      const awayTeam = standings[awaySeed - 1];
      if (!homeTeam || !awayTeam) {
        throw new Error(`Nincs elég csapat a negyeddöntőhöz. Hiányzik a ${homeTeam ? awaySeed : homeSeed}. helyezett csapat.`);
      }
      matchups.push({
        homeTeamId: homeTeam.teamId,
        homeTeamName: homeTeam.name,
        awayTeamId: awayTeam.teamId,
        awayTeamName: awayTeam.name,
      });
    }
  } else if (nextRound === 2) {
    // Semifinals: need to check quarterfinal results
    // Get quarterfinal matches - use gameDay = 1 to track quarterfinals
    const quarterfinalMatches = await db
      .select()
      .from(matches)
      .where(and(
        eq(matches.leagueId, leagueId),
        eq(matches.isPlayoffMatch, true),
        eq(matches.gameDay, 1)
      ))
      .orderBy(asc(matches.matchRound));

    // Group matches by matchup (each matchup has BO matches)
    // IMPORTANT: Matches alternate home/away, so we need to track the original matchup order
    // and determine which team is "home" for the series based on match number
    const matchupResults = new Map<string, { 
      homeWins: number; 
      awayWins: number; 
      originalHomeTeamId: string; 
      originalAwayTeamId: string;
      matchCount: number; // Track how many matches we've seen for this matchup
    }>();
    
    for (const match of quarterfinalMatches) {
      // Sort team IDs to create consistent key regardless of home/away order
      const teamIds = [match.homeTeamId, match.awayTeamId].sort();
      const key = `${teamIds[0]}-${teamIds[1]}`;
      
      if (!matchupResults.has(key)) {
        // First match of this matchup - determine original home/away based on first match
        matchupResults.set(key, { 
          homeWins: 0, 
          awayWins: 0, 
          originalHomeTeamId: match.homeTeamId, 
          originalAwayTeamId: match.awayTeamId,
          matchCount: 0
        });
      }
      
      const result = matchupResults.get(key)!;
      result.matchCount++;
      
      if (match.matchStatus === 'completed' && match.homeTeamScore !== null && match.awayTeamScore !== null) {
        // Determine which team is "home" for this specific match in the series
        // Odd matches (1,3,5,7): original home team is home
        // Even matches (2,4,6): original away team is home
        const matchNumber = result.matchCount;
        const isOddMatch = matchNumber % 2 === 1;
        const isOriginalHomeTeamHomeThisMatch = isOddMatch;
        
        // Determine which team won from the perspective of the original matchup
        if (match.homeTeamScore > match.awayTeamScore) {
          // The team that was home in this match won
          if (isOriginalHomeTeamHomeThisMatch) {
            // Original home team was home and won
            result.homeWins++;
          } else {
            // Original away team was home and won (so they win from original perspective)
            result.awayWins++;
          }
        } else if (match.awayTeamScore > match.homeTeamScore) {
          // The team that was away in this match won
          if (isOriginalHomeTeamHomeThisMatch) {
            // Original away team was away and won (so they win from original perspective)
            result.awayWins++;
          } else {
            // Original home team was away and won
            result.homeWins++;
          }
        }
      }
    }

    // Determine winners and create semifinal matchups
    // IMPORTANT: Only include teams that reached winsNeeded (e.g., 4 wins in BO7)
    const winners: string[] = [];
    for (const [key, result] of matchupResults.entries()) {
      // Check if someone reached winsNeeded (e.g., 4 wins in BO7)
      if (result.homeWins >= winsNeeded) {
        winners.push(result.originalHomeTeamId);
      } else if (result.awayWins >= winsNeeded) {
        winners.push(result.originalAwayTeamId);
      }
      // Don't include teams that haven't reached winsNeeded yet
    }

    if (quarterfinalMatches.length === 0) {
      throw new Error('Nincsenek negyeddöntő meccsek. Először generáld a negyeddöntő meccseket!');
    }

    if (matchupResults.size < 4) {
      throw new Error(`Nincs elég negyeddöntő párharc befejezve. Jelenleg ${matchupResults.size} párharc van, de 4 szükséges az elődöntőhöz.`);
    }

    if (winners.length < 4) {
      throw new Error(`Nincs elég győztes a negyeddöntőből. Jelenleg ${winners.length} győztes van, de 4 szükséges az elődöntőhöz.`);
    }

    // Create semifinal matchups: winner1 vs winner2, winner3 vs winner4
    matchups.push({
      homeTeamId: winners[0],
      homeTeamName: standings.find(s => s.teamId === winners[0])?.name || '',
      awayTeamId: winners[1],
      awayTeamName: standings.find(s => s.teamId === winners[1])?.name || '',
    });
    matchups.push({
      homeTeamId: winners[2],
      homeTeamName: standings.find(s => s.teamId === winners[2])?.name || '',
      awayTeamId: winners[3],
      awayTeamName: standings.find(s => s.teamId === winners[3])?.name || '',
    });
  } else if (nextRound === 3) {
    // Finals: need to check semifinal results
    // Get semifinal matches - use gameDay = 2 to track semifinals
    const semifinalMatches = await db
      .select()
      .from(matches)
      .where(and(
        eq(matches.leagueId, leagueId),
        eq(matches.isPlayoffMatch, true),
        eq(matches.gameDay, 2)
      ))
      .orderBy(asc(matches.matchRound));

    const matchupResults = new Map<string, { 
      homeWins: number; 
      awayWins: number; 
      originalHomeTeamId: string; 
      originalAwayTeamId: string;
      matchCount: number;
    }>();
    
    for (const match of semifinalMatches) {
      // Sort team IDs to create consistent key regardless of home/away order
      const teamIds = [match.homeTeamId, match.awayTeamId].sort();
      const key = `${teamIds[0]}-${teamIds[1]}`;
      
      if (!matchupResults.has(key)) {
        matchupResults.set(key, { 
          homeWins: 0, 
          awayWins: 0, 
          originalHomeTeamId: match.homeTeamId, 
          originalAwayTeamId: match.awayTeamId,
          matchCount: 0
        });
      }
      
      const result = matchupResults.get(key)!;
      result.matchCount++;
      
      if (match.matchStatus === 'completed' && match.homeTeamScore !== null && match.awayTeamScore !== null) {
        // Determine which team is "home" for this specific match in the series
        const matchNumber = result.matchCount;
        const isOddMatch = matchNumber % 2 === 1;
        const isOriginalHomeTeamHomeThisMatch = isOddMatch;
        
        if (match.homeTeamScore > match.awayTeamScore) {
          if (isOriginalHomeTeamHomeThisMatch) {
            result.homeWins++;
          } else {
            result.awayWins++;
          }
        } else if (match.awayTeamScore > match.homeTeamScore) {
          if (isOriginalHomeTeamHomeThisMatch) {
            result.awayWins++;
          } else {
            result.homeWins++;
          }
        }
      }
    }

    const winners: string[] = [];
    for (const [key, result] of matchupResults.entries()) {
      // Check if someone reached winsNeeded (e.g., 4 wins in BO7)
      if (result.homeWins >= winsNeeded) {
        winners.push(result.originalHomeTeamId);
      } else if (result.awayWins >= winsNeeded) {
        winners.push(result.originalAwayTeamId);
      }
      // Don't include teams that haven't reached winsNeeded yet
    }

    if (semifinalMatches.length === 0) {
      throw new Error('Nincsenek elődöntő meccsek. Először generáld az elődöntő meccseket!');
    }

    if (matchupResults.size < 2) {
      throw new Error(`Nincs elég elődöntő párharc befejezve. Jelenleg ${matchupResults.size} párharc van, de 2 szükséges a döntőhöz.`);
    }

    if (winners.length < 2) {
      throw new Error(`Nincs elég győztes az elődöntőből. Jelenleg ${winners.length} győztes van, de 2 szükséges a döntőhöz.`);
    }

    matchups.push({
      homeTeamId: winners[0],
      homeTeamName: standings.find(s => s.teamId === winners[0])?.name || '',
      awayTeamId: winners[1],
      awayTeamName: standings.find(s => s.teamId === winners[1])?.name || '',
    });
  } else {
    throw new Error('Érvénytelen knockout round');
  }

  if (matchups.length === 0) {
    throw new Error(`Nem sikerült párharcokat generálni a ${nextRound === 1 ? 'negyeddöntőhöz' : nextRound === 2 ? 'elődöntőhöz' : 'döntőhöz'}. Ellenőrizd, hogy minden szükséges meccs le van-e játszva.`);
  }

  return {
    matchups,
    knockoutRound: nextRound,
    totalMatchups: matchups.length,
  };
}

export interface KnockoutBracketMatchup {
  homeTeamId: string;
  homeTeamName: string;
  awayTeamId: string;
  awayTeamName: string;
  homeWins: number;
  awayWins: number;
  winnerId?: string;
  isComplete: boolean;
}

export async function getKnockoutBracketData(leagueId: string) {
  const [league] = await db.select().from(leagues).where(eq(leagues.id, leagueId));
  if (!league) throw new Error('League not found');

  const props = (league.properties || {}) as any;
  const hasKnockoutPlayoff = Boolean(props?.hasPlayoff && props?.playoffType === 'knockout');
  if (!hasKnockoutPlayoff) {
    return null;
  }

  // Get BO number from properties or default to 7
  const bestOf = props?.knockoutBestOf || 7;
  const winsNeeded = Math.ceil(bestOf / 2);

  // Get standings for team names
  const standings = await computeStandings(leagueId);
  const teamMap = new Map<string, { name: string; seed: number }>();
  standings.forEach((s: any, idx: number) => {
    teamMap.set(s.teamId, { name: s.name, seed: idx + 1 });
  });

  const result: {
    quarterfinals: KnockoutBracketMatchup[];
    semifinals: KnockoutBracketMatchup[];
    finals: KnockoutBracketMatchup[];
  } = {
    quarterfinals: [],
    semifinals: [],
    finals: [],
  };

  // Get all playoff matches grouped by round (gameDay)
  const allPlayoffMatches = await db
    .select()
    .from(matches)
    .where(and(
      eq(matches.leagueId, leagueId),
      eq(matches.isPlayoffMatch, true)
    ))
    .orderBy(asc(matches.gameDay), asc(matches.matchRound));

  // Process quarterfinals (gameDay = 1)
  const quarterfinalMatches = allPlayoffMatches.filter(m => m.gameDay === 1);
  const quarterfinalMatchups = new Map<string, KnockoutBracketMatchup>();

  // Expected quarterfinal seeds: 1-8, 4-5, 3-6, 7-2
  const quarterfinalSeeds = [1, 8, 4, 5, 3, 6, 7, 2];
  for (let i = 0; i < quarterfinalSeeds.length; i += 2) {
    const homeSeed = quarterfinalSeeds[i];
    const awaySeed = quarterfinalSeeds[i + 1];
    const homeTeam = standings[homeSeed - 1];
    const awayTeam = standings[awaySeed - 1];
    if (homeTeam && awayTeam) {
      const key = `${homeTeam.teamId}-${awayTeam.teamId}`;
      quarterfinalMatchups.set(key, {
        homeTeamId: homeTeam.teamId,
        homeTeamName: homeTeam.name,
        awayTeamId: awayTeam.teamId,
        awayTeamName: awayTeam.name,
        homeWins: 0,
        awayWins: 0,
        isComplete: false,
      });
    }
  }

  // Count wins from quarterfinal matches
  // Track match count per matchup to handle alternating home/away
  const matchupMatchCounts = new Map<string, number>();
  for (const match of quarterfinalMatches) {
    const key = `${match.homeTeamId}-${match.awayTeamId}`;
    const reverseKey = `${match.awayTeamId}-${match.homeTeamId}`;
    const matchup = quarterfinalMatchups.get(key) || quarterfinalMatchups.get(reverseKey);
    
    if (matchup) {
      // Track match number for this matchup
      const matchupKey = matchup.homeTeamId < matchup.awayTeamId 
        ? `${matchup.homeTeamId}-${matchup.awayTeamId}`
        : `${matchup.awayTeamId}-${matchup.homeTeamId}`;
      const currentMatchCount = matchupMatchCounts.get(matchupKey) || 0;
      matchupMatchCounts.set(matchupKey, currentMatchCount + 1);
      const matchNumber = currentMatchCount + 1;
      
      if (match.matchStatus === 'completed' && match.homeTeamScore !== null && match.awayTeamScore !== null) {
        // Determine which team is "home" for this specific match in the series
        // Odd matches (1,3,5,7): original home team is home
        // Even matches (2,4,6): original away team is home
        const isOddMatch = matchNumber % 2 === 1;
        const isOriginalHomeTeamHomeThisMatch = isOddMatch;
        
        if (match.homeTeamScore > match.awayTeamScore) {
          if (isOriginalHomeTeamHomeThisMatch) {
            matchup.homeWins++;
          } else {
            matchup.awayWins++;
          }
        } else if (match.awayTeamScore > match.homeTeamScore) {
          if (isOriginalHomeTeamHomeThisMatch) {
            matchup.awayWins++;
          } else {
            matchup.homeWins++;
          }
        }
        
        // Check if someone reached winsNeeded
        if (matchup.homeWins >= winsNeeded || matchup.awayWins >= winsNeeded) {
          matchup.isComplete = true;
          matchup.winnerId = matchup.homeWins >= winsNeeded ? matchup.homeTeamId : matchup.awayTeamId;
        }
      }
    }
  }

  result.quarterfinals = Array.from(quarterfinalMatchups.values());

  // Process semifinals (gameDay = 2) - only if quarterfinals are complete
  const semifinalMatches = allPlayoffMatches.filter(m => m.gameDay === 2);
  if (semifinalMatches.length > 0) {
    const semifinalMatchups = new Map<string, KnockoutBracketMatchup>();

    // Get quarterfinal winners
    const quarterfinalWinners = result.quarterfinals
      .filter(m => m.winnerId)
      .map(m => m.winnerId!)
      .slice(0, 4); // Top 4 winners

    if (quarterfinalWinners.length >= 4) {
      // Create semifinal matchups: winner1 vs winner2, winner3 vs winner4
      const semi1Key = `${quarterfinalWinners[0]}-${quarterfinalWinners[1]}`;
      const semi2Key = `${quarterfinalWinners[2]}-${quarterfinalWinners[3]}`;
      
      semifinalMatchups.set(semi1Key, {
        homeTeamId: quarterfinalWinners[0],
        homeTeamName: teamMap.get(quarterfinalWinners[0])?.name || '',
        awayTeamId: quarterfinalWinners[1],
        awayTeamName: teamMap.get(quarterfinalWinners[1])?.name || '',
        homeWins: 0,
        awayWins: 0,
        isComplete: false,
      });

      semifinalMatchups.set(semi2Key, {
        homeTeamId: quarterfinalWinners[2],
        homeTeamName: teamMap.get(quarterfinalWinners[2])?.name || '',
        awayTeamId: quarterfinalWinners[3],
        awayTeamName: teamMap.get(quarterfinalWinners[3])?.name || '',
        homeWins: 0,
        awayWins: 0,
        isComplete: false,
      });

      // Count wins from semifinal matches
      // Track match count per matchup to handle alternating home/away
      const semifinalMatchCounts = new Map<string, number>();
      for (const match of semifinalMatches) {
        const key = `${match.homeTeamId}-${match.awayTeamId}`;
        const reverseKey = `${match.awayTeamId}-${match.homeTeamId}`;
        const matchup = semifinalMatchups.get(key) || semifinalMatchups.get(reverseKey);
        
        if (matchup) {
          // Track match number for this matchup
          const matchupKey = matchup.homeTeamId < matchup.awayTeamId 
            ? `${matchup.homeTeamId}-${matchup.awayTeamId}`
            : `${matchup.awayTeamId}-${matchup.homeTeamId}`;
          const currentMatchCount = semifinalMatchCounts.get(matchupKey) || 0;
          semifinalMatchCounts.set(matchupKey, currentMatchCount + 1);
          const matchNumber = currentMatchCount + 1;
          
          if (match.matchStatus === 'completed' && match.homeTeamScore !== null && match.awayTeamScore !== null) {
            // Determine which team is "home" for this specific match in the series
            const isOddMatch = matchNumber % 2 === 1;
            const isOriginalHomeTeamHomeThisMatch = isOddMatch;
            
            if (match.homeTeamScore > match.awayTeamScore) {
              if (isOriginalHomeTeamHomeThisMatch) {
                matchup.homeWins++;
              } else {
                matchup.awayWins++;
              }
            } else if (match.awayTeamScore > match.homeTeamScore) {
              if (isOriginalHomeTeamHomeThisMatch) {
                matchup.awayWins++;
              } else {
                matchup.homeWins++;
              }
            }
            
            if (matchup.homeWins >= winsNeeded || matchup.awayWins >= winsNeeded) {
              matchup.isComplete = true;
              matchup.winnerId = matchup.homeWins >= winsNeeded ? matchup.homeTeamId : matchup.awayTeamId;
            }
          }
        }
      }

      result.semifinals = Array.from(semifinalMatchups.values());
    }
  }

  // Process finals (gameDay = 3)
  const finalMatches = allPlayoffMatches.filter(m => m.gameDay === 3);
  if (finalMatches.length > 0 && result.semifinals.length >= 2) {
    const semifinalWinners = result.semifinals
      .filter(m => m.winnerId)
      .map(m => m.winnerId!)
      .slice(0, 2);

    if (semifinalWinners.length >= 2) {
      const finalMatchup: KnockoutBracketMatchup = {
        homeTeamId: semifinalWinners[0],
        homeTeamName: teamMap.get(semifinalWinners[0])?.name || '',
        awayTeamId: semifinalWinners[1],
        awayTeamName: teamMap.get(semifinalWinners[1])?.name || '',
        homeWins: 0,
        awayWins: 0,
        isComplete: false,
      };

      // Count wins from final matches
      // Track match count to handle alternating home/away
      let finalMatchCount = 0;
      for (const match of finalMatches) {
        finalMatchCount++;
        const matchNumber = finalMatchCount;
        const isOddMatch = matchNumber % 2 === 1;
        const isOriginalHomeTeamHomeThisMatch = isOddMatch;
        
        if (match.matchStatus === 'completed' && match.homeTeamScore !== null && match.awayTeamScore !== null) {
          if (match.homeTeamScore > match.awayTeamScore) {
            if (isOriginalHomeTeamHomeThisMatch) {
              finalMatchup.homeWins++;
            } else {
              finalMatchup.awayWins++;
            }
          } else if (match.awayTeamScore > match.homeTeamScore) {
            if (isOriginalHomeTeamHomeThisMatch) {
              finalMatchup.awayWins++;
            } else {
              finalMatchup.homeWins++;
            }
          }
          
          if (finalMatchup.homeWins >= winsNeeded || finalMatchup.awayWins >= winsNeeded) {
            finalMatchup.isComplete = true;
            finalMatchup.winnerId = finalMatchup.homeWins >= winsNeeded ? finalMatchup.homeTeamId : finalMatchup.awayTeamId;
          }
        }
      }

      result.finals = [finalMatchup];
    }
  }

  return result;
}

export async function saveKnockoutPlayoffMatches(
  leagueId: string,
  input: GenerateKnockoutPlayoffMatchesInput
) {
  const [league] = await db.select().from(leagues).where(eq(leagues.id, leagueId));
  if (!league) throw new Error('League not found');

  const relations = await db.select().from(leagueTeams).where(eq(leagueTeams.leagueId, leagueId));
  const teamToLeagueTeam = new Map<string, string>();
  for (const rel of relations as any[]) {
    teamToLeagueTeam.set(String(rel.teamId), rel.id);
  }

  // Get max round from regular matches
  const maxRoundRows = await db
    .select({ maxRound: sql<number>`COALESCE(MAX(${matches.matchRound}), 0)` })
    .from(matches)
    .where(and(eq(matches.leagueId, leagueId), eq(matches.isPlayoffMatch, false)));
  const baseRound = Number(maxRoundRows?.[0]?.maxRound || 0);

  const rows: any[] = [];
  let matchRoundCounter = baseRound + 1;

  for (const matchInput of input.matches) {
    const homeId = String(matchInput.homeTeamId);
    const awayId = String(matchInput.awayTeamId);
    const homeLeagueTeamId = teamToLeagueTeam.get(homeId) || null;
    const awayLeagueTeamId = teamToLeagueTeam.get(awayId) || null;

    // Parse date and time
    let matchAt: Date;
    if (matchInput.date && matchInput.time) {
      const iso = `${matchInput.date}T${matchInput.time}:00`;
      matchAt = new Date(iso);
    } else {
      throw new Error(`Meccs ${matchInput.matchNumber} (Round ${matchInput.knockoutRound}): dátum és idő megadása kötelező`);
    }

    const matchDate = matchInput.date ? new Date(matchInput.date) : new Date(matchAt);
    const matchTime = new Date(`${matchInput.date}T${matchInput.time}:00`);

    rows.push({
      leagueId,
      teamId: homeId,
      homeTeamId: homeId,
      awayTeamId: awayId,
      homeLeagueTeamId,
      awayLeagueTeamId,
      homeTeamScore: 0,
      awayTeamScore: 0,
      matchAt,
      matchDate,
      matchTime,
      matchStatus: 'scheduled',
      matchType: 'playoff',
      isPlayoffMatch: true,
      matchRound: matchRoundCounter++,
      gameDay: matchInput.knockoutRound, // Use gameDay to track which knockout round (1=quarter, 2=semi, 3=final)
      matchTable: matchInput.table || 1,
      trackingActive: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  if (rows.length === 0) {
    throw new Error('Nincs meccs a mentéshez');
  }

  await db.insert(matches as any).values(rows as any);

  // Update league knockoutRound
  await db.update(leagues)
    .set({ knockoutRound: input.matches[0]?.knockoutRound || 1 })
    .where(eq(leagues.id, leagueId));

  return rows.length;
}

export async function getPlayoffHouseMatches(leagueId: string) {
  const groups = await computeGroupedPlayoffTables(leagueId);
  if (!groups.enabled) {
    return { enabled: false, upper: [], lower: [] };
  }
  const upperIds = new Set(groups.upper?.teamIds ?? []);
  const lowerIds = new Set(groups.lower?.teamIds ?? []);
  const homeTeams = alias(teams, 'playoff_home');
  const awayTeams = alias(teams, 'playoff_away');
  const rows = await db.select({
    match: {
      id: matches.id,
      leagueId: matches.leagueId,
      homeTeamId: matches.homeTeamId,
      awayTeamId: matches.awayTeamId,
      homeTeamScore: matches.homeTeamScore,
      awayTeamScore: matches.awayTeamScore,
      matchAt: matches.matchAt,
      matchRound: matches.matchRound,
      gameDay: matches.gameDay,
      matchTable: matches.matchTable,
      matchStatus: matches.matchStatus,
    },
    homeTeam: { id: homeTeams.id, name: homeTeams.name, logo: homeTeams.logo },
    awayTeam: { id: awayTeams.id, name: awayTeams.name, logo: awayTeams.logo },
  })
    .from(matches)
    .leftJoin(homeTeams, eq(matches.homeTeamId, homeTeams.id))
    .leftJoin(awayTeams, eq(matches.awayTeamId, awayTeams.id))
    .where(and(eq(matches.leagueId, leagueId), eq(matches.isPlayoffMatch, true)))
    .orderBy(asc(matches.matchRound), asc(matches.matchAt));

  const upper: any[] = [];
  const lower: any[] = [];
  for (const row of rows as any[]) {
    const homeId = String(row.match.homeTeamId);
    const awayId = String(row.match.awayTeamId);
    const entry = {
      id: row.match.id,
      round: row.match.matchRound,
      gameDay: row.match.gameDay,
      table: row.match.matchTable,
      status: row.match.matchStatus,
      matchAt: row.match.matchAt,
      home: {
        id: homeId,
        name: row.homeTeam?.name || '',
        logo: row.homeTeam?.logo || null,
        score: row.match.homeTeamScore,
      },
      away: {
        id: awayId,
        name: row.awayTeam?.name || '',
        logo: row.awayTeam?.logo || null,
        score: row.match.awayTeamScore,
      },
    };
    if (upperIds.has(homeId) && upperIds.has(awayId)) {
      upper.push(entry);
    } else if (lowerIds.has(homeId) && lowerIds.has(awayId)) {
      lower.push(entry);
    }
  }

  return {
    enabled: true,
    upper,
    lower,
  };
}

export async function computeGameDayMvps(leagueId: string) {
  // group matches by day, exclude playoff fixtures
  const all = await db.select()
    .from(matches)
    .where(and(eq(matches.leagueId, leagueId), eq(matches.isPlayoffMatch, false)))
    .orderBy(asc(matches.matchAt));
  const dayMap = new Map<string, { key: string; gameDay?: number; date?: string; items: any[] }>();
  for (const m of all as any[]) {
    // Prefer explicit gameDay if available; fallback to date key
    if (m.gameDay) {
      const key = String(m.gameDay);
      if (!dayMap.has(key)) dayMap.set(key, { key, gameDay: m.gameDay, items: [] });
      dayMap.get(key)!.items.push(m);
      continue;
    }
    const d = (m.matchAt || m.matchDate) as Date;
    if (!d) continue;
    const key = new Date(d).toISOString().slice(0,10);
    if (!dayMap.has(key)) dayMap.set(key, { key, date: key, items: [] });
    dayMap.get(key)!.items.push(m);
  }
  const results: any[] = [];
  for (const [, bucket] of dayMap.entries()) {
    const list = bucket.items;
    const allCompleted = list.every((m: any) => m.matchStatus === 'completed');
    if (!allCompleted) { results.push({ gameDay: bucket.gameDay, date: bucket.date, mvp: null }); continue; }
    // get winner team for that day
    const daily = await computeStandings(leagueId, bucket.gameDay ? { gameDay: bucket.gameDay } : { date: bucket.date });
    const winner = daily[0];
    if (!winner) { results.push({ gameDay: bucket.gameDay, date: bucket.date, mvp: null }); continue; }
    const winnerTeamId = winner.teamId as string;
    // count MVP votes within this day for winner team
    const voteCount = new Map<string, number>();
    for (const m of list as any[]) {
      if (m.homeTeamId === winnerTeamId && m.homeTeamBestPlayerId) {
        voteCount.set(m.homeTeamBestPlayerId, (voteCount.get(m.homeTeamBestPlayerId) || 0) + 1);
      }
      if (m.awayTeamId === winnerTeamId && m.awayTeamBestPlayerId) {
        voteCount.set(m.awayTeamBestPlayerId, (voteCount.get(m.awayTeamBestPlayerId) || 0) + 1);
      }
    }
    if (voteCount.size === 0) { results.push({ gameDay: bucket.gameDay, date: bucket.date, mvp: null }); continue; }
    // select max votes
    let topPlayerId = Array.from(voteCount.keys())[0] as string;
    let topVotes = voteCount.get(topPlayerId)!;
    for (const [pid, cnt] of voteCount.entries()) {
      if (cnt > topVotes) { topPlayerId = pid; topVotes = cnt; }
    }
    const [pl] = await db.select().from(players).where(eq(players.id, topPlayerId));
    const [team] = await db.select().from(teams).where(eq(teams.id, winnerTeamId));
    results.push({ gameDay: bucket.gameDay, date: bucket.date, mvp: pl ? { playerId: topPlayerId, name: pl.nickname || pl.firstName || pl.lastName, teamId: winnerTeamId, teamName: team?.name || '' } : null });
  }
  // sort by date asc
  results.sort((a, b) => {
    if (a.gameDay && b.gameDay) return a.gameDay - b.gameDay;
    if (a.date && b.date) return a.date.localeCompare(b.date);
    return 0;
  });
  return results;
}

export async function computeRankSeries(leagueId: string, teamId: string) {
  // find max round in this league (exclude playoff matches)
  const rows = await db.select({ maxRound: sql<number>`COALESCE(MAX(${matches.matchRound}), 0)` })
    .from(matches)
    .where(and(eq(matches.leagueId, leagueId), eq(matches.isPlayoffMatch, false)));
  const maxRound = Number(rows?.[0]?.maxRound || 0);
  const series: { round: number; rank: number | null }[] = [];
  if (maxRound <= 0) return series;
  for (let r = 1; r <= maxRound; r++) {
    const standings = await computeStandings(leagueId, { uptoRound: r });
    const idx = standings.findIndex((s: any) => s.teamId === teamId);
    series.push({ round: r, rank: idx >= 0 ? (idx + 1) : null });
  }
  return series;
}

export async function getChampionship(id: string): Promise<typeof leagues.$inferSelect | null> {
  const [championship] = await db.select()
    .from(leagues)
    .where(eq(leagues.id, id));
  
  return championship || null;
}

export async function getAllChampionships(opts?: { includeInactive?: boolean }): Promise<typeof leagues.$inferSelect[]> {
  const includeInactive = opts?.includeInactive === true;
  return await db.select()
    .from(leagues)
    .where(
      includeInactive
        ? eq(leagues.isArchived, false)
        : and(eq(leagues.isArchived, false), eq(leagues.isActive, true))
    )
    .orderBy(leagues.createdAt);
}

export async function updateChampionship(id: string, data: Partial<typeof leagues.$inferSelect>): Promise<typeof leagues.$inferSelect | null> {
  const [championship] = await db.update(leagues)
    .set({
      ...data,
      updatedAt: new Date()
    })
    .where(eq(leagues.id, id))
    .returning();

  return championship || null;
}

export async function archiveChampionship(id: string): Promise<boolean> {
  const [championship] = await db.update(leagues)
    .set({
      isArchived: true,
      isActive: false,
      updatedAt: new Date()
    })
    .where(eq(leagues.id, id))
    .returning();

  return !!championship;
}
