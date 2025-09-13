import { db } from '../db';
import { leagues, leagueTeams, teams, matches } from '../database/schema';
import { and, asc, eq, inArray } from 'drizzle-orm';

/**
 * Seed league matches with varied completed results.
 * Usage:
 *   bun run src/commands/seed-matches.ts <LEAGUE_ID>
 */
async function main() {
  const leagueId = process.argv[2];
  if (!leagueId) {
    console.error('Usage: bun run src/commands/seed-matches.ts <LEAGUE_ID>');
    process.exit(1);
  }

  // Validate league
  const [league] = await db.select().from(leagues).where(eq(leagues.id, leagueId));
  if (!league) {
    console.error('League not found:', leagueId);
    process.exit(1);
  }

  // Get league-attached teams
  const ltRows = await db.select({ id: leagueTeams.id, teamId: leagueTeams.teamId })
    .from(leagueTeams)
    .where(eq(leagueTeams.leagueId, leagueId))
    .orderBy(asc(leagueTeams.createdAt));
  const teamIds = ltRows.map(t => t.teamId);
  if (teamIds.length < 2) {
    console.error('Not enough teams attached to this league.');
    process.exit(1);
  }

  const teamList = await db.select().from(teams).where(inArray(teams.id, teamIds));
  const teamIdToLeagueTeamId = new Map<string, string>();
  for (const lt of ltRows as any[]) teamIdToLeagueTeamId.set(lt.teamId as string, lt.id as string);

  // Simple round-robin once
  const pairs: Array<{ homeId: string; awayId: string }> = [];
  for (let i = 0; i < teamIds.length; i++) {
    for (let j = i + 1; j < teamIds.length; j++) {
      // Pick random home/away to vary
      const homeFirst = Math.random() < 0.5;
      pairs.push({ homeId: homeFirst ? teamIds[i]! : teamIds[j]!, awayId: homeFirst ? teamIds[j]! : teamIds[i]! });
    }
  }

  // Determine starting round offset based on existing matches
  const existing = await db.select().from(matches).where(eq(matches.leagueId, leagueId));
  let nextRound = existing.reduce((max, m: any) => Math.max(max, Number(m.matchRound || 0)), 0) + 1;

  const now = new Date();
  let globalOrder = 0;
  const rows: any[] = [];

  for (let idx = 0; idx < pairs.length; idx++) {
    const { homeId, awayId } = pairs[idx]!;

    // Randomize result: ~60% regular, ~40% OT
    const isOT = Math.random() < 0.4;
    let winnerIsHome = Math.random() < 0.5;
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

    const dayOffset = Math.floor(idx / 6); // every 6 matches as a pseudo day
    const hourOffset = (idx % 6); // tables 1..6
    const dateStr = new Date(now.getTime() + dayOffset * 24 * 60 * 60 * 1000);
    const hour = 18 + hourOffset; // 18:00 + table index
    const matchAt = new Date(dateStr);
    matchAt.setHours(hour, 0, 0, 0);

    rows.push({
      leagueId,
      teamId: homeId,
      homeTeamId: homeId,
      awayTeamId: awayId,
      homeLeagueTeamId: teamIdToLeagueTeamId.get(homeId)!,
      awayLeagueTeamId: teamIdToLeagueTeamId.get(awayId)!,
      homeTeamScore: homeScore,
      awayTeamScore: awayScore,
      matchAt,
      matchDate: matchAt,
      matchTime: matchAt,
      matchStatus: 'completed',
      matchType: 'regular',
      matchRound: nextRound,
      matchTable: (idx % 6) + 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // increase round after every 6 concurrent matches
    if ((idx + 1) % 6 === 0) nextRound += 1;
    globalOrder += 1;
  }

  if (rows.length === 0) {
    console.log('No matches to insert.');
    return;
  }

  await db.insert(matches as any).values(rows as any);
  console.log(`Inserted ${rows.length} matches for league ${leagueId}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


