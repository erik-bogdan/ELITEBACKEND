import { db } from '../db';
import { leagues, matches, teamPlayers, players } from '../database/schema';
import { and, asc, eq } from 'drizzle-orm';

/**
 * Seed EXISTING matches (already generated schedule) with varied results.
 * Usage:
 *   bun run src/commands/seed-results.ts <LEAGUE_ID>
 *
 * Notes:
 * - Does NOT create pairings; only updates scores and sets status to 'completed'
 * - Regular win: winner 10, loser 0..9
 * - OT win: winner in {13,16,19,22}, loser 10..12
 */
async function main() {
  const leagueId = process.argv[2];
  if (!leagueId) {
    console.error('Usage: bun run src/commands/seed-results.ts <LEAGUE_ID>');
    process.exit(1);
  }

  const [league] = await db.select().from(leagues).where(eq(leagues.id, leagueId));
  if (!league) {
    console.error('League not found:', leagueId);
    process.exit(1);
  }

  // Fetch existing matches for this league (any status)
  const list = await db.select({
    id: matches.id,
    homeTeamId: matches.homeTeamId,
    awayTeamId: matches.awayTeamId,
    status: matches.matchStatus,
  })
  .from(matches)
  .where(eq(matches.leagueId, leagueId))
  .orderBy(asc(matches.matchAt), asc(matches.matchTable));

  if (list.length === 0) {
    console.log('No existing matches found for this league.');
    return;
  }

  let updated = 0;
  for (const row of list) {
    // Randomize result: ~60% regular, ~40% OT
    const isOT = Math.random() < 0.4;
    const winnerIsHome = Math.random() < 0.5;

    let homeScore = 0;
    let awayScore = 0;

    if (isOT) {
      const otWins = [13, 16, 19, 22];
      const winScore = otWins[Math.floor(Math.random() * otWins.length)]!;
      const loseScore = 10 + Math.floor(Math.random() * 3); // 10..12
      if (winnerIsHome) { homeScore = winScore; awayScore = loseScore; } else { homeScore = loseScore; awayScore = winScore; }
    } else {
      const winScore = 10;
      const loseScore = Math.floor(Math.random() * 10); // 0..9
      if (winnerIsHome) { homeScore = winScore; awayScore = loseScore; } else { homeScore = loseScore; awayScore = winScore; }
    }

    // pick two players per team from teamPlayers (fallback: create temp players if missing)
    const seasonId = league.seasonId as string;
    const homeAssigned = await db.select({ pid: teamPlayers.playerId }).from(teamPlayers).where(and(eq(teamPlayers.teamId, row.homeTeamId), eq(teamPlayers.seasonId, seasonId))).orderBy(asc(teamPlayers.createdAt as any));
    const awayAssigned = await db.select({ pid: teamPlayers.playerId }).from(teamPlayers).where(and(eq(teamPlayers.teamId, row.awayTeamId), eq(teamPlayers.seasonId, seasonId))).orderBy(asc(teamPlayers.createdAt as any));

    async function ensureTwo(teamId: string, assigned: any[]) {
      const ids = assigned.map(a => a.pid as string);
      if (ids.length >= 2) return ids.slice(0, 2);
      // fallback: select base players
      const base = await db.select().from(players).where(eq(players.teamId, teamId)).orderBy(asc(players.createdAt as any));
      for (const p of base as any[]) {
        if (!ids.includes(p.id as string)) ids.push(p.id as string);
        if (ids.length >= 2) break;
      }
      // if still not enough, create temp players and assign to season
      while (ids.length < 2) {
        const [np] = await db.insert(players).values({ nickname: `Auto_${Math.random().toString(36).slice(2,6)}`, teamId }).returning();
        ids.push(np.id as string);
        await db.insert(teamPlayers).values({ teamId, playerId: np.id as string, seasonId, captain: false });
      }
      return ids.slice(0, 2);
    }

    const [homeP1, homeP2] = await ensureTwo(row.homeTeamId as string, homeAssigned as any[]);
    const [awayP1, awayP2] = await ensureTwo(row.awayTeamId as string, awayAssigned as any[]);

    // MVP: random from the winning side
    const homeWon = homeScore > awayScore;
    const winnerPlayers = homeWon ? [homeP1, homeP2] : [awayP1, awayP2];
    const mvp = winnerPlayers[Math.floor(Math.random() * winnerPlayers.length)]!;

    await db.update(matches)
      .set({
        homeTeamScore: homeScore,
        awayTeamScore: awayScore,
        matchStatus: 'completed',
        updatedAt: new Date() as any,
        homeFirstPlayerId: homeP1,
        homeSecondPlayerId: homeP2,
        awayFirstPlayerId: awayP1,
        awaySecondPlayerId: awayP2,
        homeTeamBestPlayerId: homeWon ? mvp : undefined,
        awayTeamBestPlayerId: homeWon ? undefined : mvp,
      })
      .where(eq(matches.id, row.id));
    updated += 1;
  }

  console.log(`Updated ${updated} existing matches in league ${leagueId} with results.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


