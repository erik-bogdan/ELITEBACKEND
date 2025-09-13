import { db } from '../../db';
import { leagues, teams, leagueTeams, seasons, teamPlayers, matches, players } from '../../database/schema';
import { eq, and, inArray, ne, sql, gte, lt, asc, lte } from 'drizzle-orm';

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

export async function computeStandings(leagueId: string, opts?: { date?: string; gameDay?: number; uptoGameDay?: number; uptoRound?: number }) {
  // Fetch teams attached to this league
  const leagueTeamRows = await db.select({ teamId: leagueTeams.teamId })
    .from(leagueTeams)
    .where(eq(leagueTeams.leagueId, leagueId));
  const teamIds = leagueTeamRows.map(r => r.teamId);
  const teamList = teamIds.length ? await db.select().from(teams).where(inArray(teams.id, teamIds)) : [];

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
    });
  }

  // Get completed matches for league
  const filters: any[] = [eq(matches.leagueId, leagueId), eq(matches.matchStatus, 'completed')];
  if (typeof opts?.gameDay === 'number') {
    filters.push(eq(matches.gameDay, opts.gameDay));
  }
  if (typeof opts?.uptoGameDay === 'number') {
    filters.push(lte(matches.gameDay, opts.uptoGameDay));
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

  for (const m of played as any[]) {
    const homeId = m.homeTeamId as string;
    const awayId = m.awayTeamId as string;
    const homeScore = Number(m.homeTeamScore || 0);
    const awayScore = Number(m.awayTeamScore || 0);
    if (!byTeam.has(homeId) || !byTeam.has(awayId)) continue;

    const home = byTeam.get(homeId)!;
    const away = byTeam.get(awayId)!;
    home.games += 1; away.games += 1;

    // Cup difference rule
    const maxScore = Math.max(homeScore, awayScore);
    const minScore = Math.min(homeScore, awayScore);
    const overtime = (maxScore > 10 && minScore >= 10);
    const capCupDiff = (maxScore > 13);
    const diff = capCupDiff ? 1 : Math.abs(homeScore - awayScore);

    if (homeScore === awayScore) {
      // No draws expected; skip if invalid
      continue;
    }
    const homeWon = homeScore > awayScore;
    if (homeWon) {
      home.winsTotal += 1;
      if (overtime) { home.winsOT += 1; home.points += 2; away.lossesOT += 1; away.points += 1; }
      else { home.winsRegular += 1; home.points += 3; away.lossesRegular += 1; }
      // cup diff
      home.cupDiff += diff;
      away.cupDiff -= diff;
    } else {
      away.winsTotal += 1;
      if (overtime) { away.winsOT += 1; away.points += 2; home.lossesOT += 1; home.points += 1; }
      else { away.winsRegular += 1; away.points += 3; home.lossesRegular += 1; }
      away.cupDiff += diff;
      home.cupDiff -= diff;
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

export async function computeGameDayMvps(leagueId: string) {
  // group matches by day
  const all = await db.select().from(matches).where(eq(matches.leagueId, leagueId)).orderBy(asc(matches.matchAt));
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
  // find max round in this league
  const rows = await db.select({ maxRound: sql<number>`COALESCE(MAX(${matches.matchRound}), 0)` })
    .from(matches)
    .where(eq(matches.leagueId, leagueId));
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

export async function getAllChampionships(): Promise<typeof leagues.$inferSelect[]> {
  return await db.select()
    .from(leagues)
    .where(eq(leagues.isArchived, false))
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
