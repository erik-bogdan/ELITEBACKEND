import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { db } from '../../db';
import { teams, players, teamPlayers, seasons } from '../../database/schema';
import { and, eq, notExists, sql, asc, isNull } from 'drizzle-orm';
import { nanoid } from 'nanoid';

export interface Team {
  id: string;
  name: string;
  logo: string | null;
  slug: string;
  description: string | null;
  properties: Record<string, any> | null;
  createdAt: Date | null;
}

export interface PlayerInput {
  id?: string;
  nickname: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  birthDate?: Date;
  shirtSize?: string;
}

export interface CreateTeamInput {
  name: string;
  description?: string;
  properties?: Record<string, any>;
  players?: PlayerInput[];
}

// Ensure uploads directory exists
const UPLOADS_DIR = join(process.cwd(), 'uploads', 'team-logos');
await mkdir(UPLOADS_DIR, { recursive: true });

export async function createTeam(data: CreateTeamInput): Promise<Team> {
  const slug = data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  
  // Start a transaction
  return await db.transaction(async (tx) => {
    // Create team
    const [team] = await tx.insert(teams).values({
      name: data.name,
      slug,
      description: data.description,
      properties: data.properties
    }).returning();

    // Handle players if provided
    if (data.players && data.players.length > 0) {
      // Find active season (optional)
      const [activeSeason] = await tx.select().from(seasons).where(eq(seasons.isActive, true));
      for (const player of data.players) {
        let playerId: string | null = null;
        if (player.id) {
          // If player ID is provided, update the player's team and shirt size if provided
          await tx.update(players)
            .set({ teamId: team.id, shirtSize: (player as any).shirtSize ?? null })
            .where(eq(players.id, player.id));
          playerId = player.id;
        } else {
          // If no ID, create new player
          const [created] = await tx.insert(players).values({
            nickname: player.nickname,
            firstName: player.firstName,
            lastName: player.lastName,
            email: player.email,
            teamId: team.id,
            birthDate: player.birthDate,
            shirtSize: (player as any).shirtSize || null,
          }).returning();
          playerId = (created as any)?.id as string;
        }

        // Link player to the team for the active season if exists
        if (playerId && activeSeason?.id) {
          const existing = await tx
            .select()
            .from(teamPlayers)
            .where(and(eq(teamPlayers.teamId, team.id), eq(teamPlayers.playerId, playerId), eq(teamPlayers.seasonId, activeSeason.id)));
          if (existing.length === 0) {
            await tx.insert(teamPlayers).values({
              teamId: team.id,
              playerId,
              seasonId: activeSeason.id,
              captain: false,
            });
          }
        }
      }
    }

    return team as Team;
  });
}

export async function getAllTeams(): Promise<Team[]> {
  const result = await db.select().from(teams);
  return result as Team[];
}

export async function getTeamById(id: string): Promise<Team> {
  const [team] = await db.select().from(teams).where(eq(teams.id, id));
  if (!team) {
    throw new Error('Team not found');
  }
  return team as Team;
}

export async function getTeamBySlug(slug: string): Promise<Team> {
  const [team] = await db.select().from(teams).where(eq(teams.slug, slug));
  if (!team) {
    throw new Error('Team not found');
  }
  return team as Team;
}

export async function updateTeam(id: string, data: { name?: string; description?: string; properties?: Record<string, any> }): Promise<Team> {
  const [team] = await db.select().from(teams).where(eq(teams.id, id));
  if (!team) {
    throw new Error('Team not found');
  }

  const updateData: any = { ...data };
  if (data.name) {
    updateData.slug = data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  }

  const [updatedTeam] = await db.update(teams)
    .set(updateData)
    .where(eq(teams.id, id))
    .returning();

  return updatedTeam as Team;
}

export async function uploadTeamLogo(id: string, logo: File): Promise<Team> {
  const [team] = await db.select().from(teams).where(eq(teams.id, id));
  if (!team) {
    throw new Error('Team not found');
  }
  
  const fileName = `${team.slug}-${nanoid()}.${logo.name.split('.').pop()}`;
  const filePath = join(UPLOADS_DIR, fileName);
  
  // Save file to local storage
  const arrayBuffer = await logo.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  await writeFile(filePath, buffer);
  
  // Update team with logo path
  const [updatedTeam] = await db.update(teams)
    .set({ logo: `/uploads/team-logos/${fileName}` })
    .where(eq(teams.id, id))
    .returning();
  
  return updatedTeam as Team;
}

export async function deleteTeam(id: string): Promise<{ success: boolean }> {
  const [team] = await db.select().from(teams).where(eq(teams.id, id));
  if (!team) {
    throw new Error('Team not found');
  }
  
  await db.delete(teams).where(eq(teams.id, id));
  return { success: true };
}

// New: season-scoped team players
export async function getTeamPlayersBySeason(teamId: string, seasonId: string) {
  // validate team and season exist
  const [team] = await db.select().from(teams).where(eq(teams.id, teamId));
  if (!team) throw new Error('Team not found');
  const [season] = await db.select().from(seasons).where(eq(seasons.id, seasonId));
  if (!season) throw new Error('Season not found');

  const rows = await db
    .select({
      id: players.id,
      nickname: players.nickname,
      firstName: players.firstName,
      lastName: players.lastName,
      email: players.email,
      image: players.image,
      birthDate: players.birthDate,
      shirtSize: players.shirtSize,
      captain: teamPlayers.captain,
    })
    .from(teamPlayers)
    .innerJoin(players, eq(teamPlayers.playerId, players.id))
    .where(and(eq(teamPlayers.teamId, teamId), eq(teamPlayers.seasonId, seasonId)))
    .orderBy(asc(teamPlayers.createdAt));

  return rows;
}

export async function assignPlayerToTeamSeason(teamId: string, playerId: string, seasonId: string, captain?: boolean) {
  return await db.transaction(async (tx) => {
    const existing = await tx
      .select()
      .from(teamPlayers)
      .where(and(eq(teamPlayers.teamId, teamId), eq(teamPlayers.playerId, playerId), eq(teamPlayers.seasonId, seasonId)));

    if (captain) {
      // Ensure only one captain per team per season
      await tx
        .update(teamPlayers)
        .set({ captain: false })
        .where(and(eq(teamPlayers.teamId, teamId), eq(teamPlayers.seasonId, seasonId)));

      if (existing.length > 0) {
        await tx
          .update(teamPlayers)
          .set({ captain: true })
          .where(and(eq(teamPlayers.teamId, teamId), eq(teamPlayers.playerId, playerId), eq(teamPlayers.seasonId, seasonId)));
      } else {
        await tx.insert(teamPlayers).values({ teamId, playerId, seasonId, captain: true });
      }
      return { success: true };
    }

    if (existing.length > 0) return { success: true };
    await tx.insert(teamPlayers).values({ teamId, playerId, seasonId, captain: false });
    return { success: true };
  });
}

export async function unassignPlayerFromTeamSeason(teamId: string, playerId: string, seasonId: string) {
  await db
    .delete(teamPlayers)
    .where(and(eq(teamPlayers.teamId, teamId), eq(teamPlayers.playerId, playerId), eq(teamPlayers.seasonId, seasonId)));
  return { success: true };
}

export async function getAvailablePlayersForTeamSeason(teamId: string, seasonId: string) {
  // validate team and season exist to avoid 500s on bad inputs
  const [team] = await db.select().from(teams).where(eq(teams.id, teamId));
  if (!team) throw new Error('Team not found');
  const [season] = await db.select().from(seasons).where(eq(seasons.id, seasonId));
  if (!season) throw new Error('Season not found');

  // players belonging to team but not yet assigned for the season
  const rows = await db
    .select({
      id: players.id,
      nickname: players.nickname,
      firstName: players.firstName,
      lastName: players.lastName,
      email: players.email,
      image: players.image,
    })
    .from(players)
    .leftJoin(
      teamPlayers,
      and(
        eq(teamPlayers.teamId, teamId),
        eq(teamPlayers.playerId, players.id),
        eq(teamPlayers.seasonId, seasonId)
      )
    )
    .where(and(eq(players.teamId, teamId), isNull(teamPlayers.id)));

  return rows;
}
