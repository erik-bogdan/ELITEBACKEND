import { db } from '../db';
import { teams, players, teamPlayers, seasons } from '../database/schema';
import { and, asc, eq } from 'drizzle-orm';

function makeNickname(teamName: string, index: number): string {
  const base = teamName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6) || 'ELITE';
  return `${base}_${index + 1}`;
}

async function main() {
  const allTeams = await db.select().from(teams).orderBy(asc(teams.createdAt as any));
  if (!allTeams.length) {
    console.log('No teams found.');
    return;
  }

  // Pick an active season, if any, to also assign players for the season
  const [activeSeason] = await db.select().from(seasons).where(eq(seasons.isActive, true)).orderBy(asc(seasons.createdAt as any));
  const activeSeasonId = activeSeason?.id as string | undefined;

  let createdPlayers = 0;
  let createdAssignments = 0;

  for (const t of allTeams as any[]) {
    // Count existing base players linked to the team
    const teamPlayersList = await db.select().from(players).where(eq(players.teamId, t.id));
    const currentCount = teamPlayersList.length;
    const toCreate = Math.max(0, 3 - currentCount);

    for (let i = 0; i < toCreate; i++) {
      const nick = makeNickname(t.name as string, currentCount + i);
      const [p] = await db.insert(players).values({
        nickname: nick,
        firstName: `Auto${(currentCount + i + 1).toString().padStart(2, '0')}`,
        lastName: 'Seed',
        email: undefined,
        teamId: t.id,
      }).returning();
      createdPlayers += 1;

      // If an active season exists, also ensure assignment for the season
      if (activeSeasonId) {
        await db.insert(teamPlayers).values({
          teamId: t.id,
          playerId: p.id,
          seasonId: activeSeasonId,
          captain: false,
        });
        createdAssignments += 1;
      }
    }

    // If we already had >=1 players but no season assignment, ensure we have 3 assigned for the active season too
    if (activeSeasonId) {
      const assigned = await db
        .select({ pid: teamPlayers.playerId })
        .from(teamPlayers)
        .where(and(eq(teamPlayers.teamId, t.id), eq(teamPlayers.seasonId, activeSeasonId)));
      const assignedIds = new Set((assigned as any[]).map(x => x.pid as string));
      const need = Math.max(0, 3 - assignedIds.size);
      if (need > 0) {
        // Select first (need) base players that are not yet assigned for this season
        const base = await db.select().from(players).where(eq(players.teamId, t.id)).orderBy(asc(players.createdAt as any));
        for (const p of base as any[]) {
          if (assignedIds.has(p.id as string)) continue;
          await db.insert(teamPlayers).values({ teamId: t.id, playerId: p.id, seasonId: activeSeasonId, captain: false });
          createdAssignments += 1;
          assignedIds.add(p.id as string);
          if (assignedIds.size >= 3) break;
        }
      }
    }
  }

  console.log(`Seed complete. New players: ${createdPlayers}. New season assignments: ${createdAssignments}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


