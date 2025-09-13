import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { db } from '../../db';
import { players, teams, teamPlayers, seasons, playerInvitations } from '../../database/schema';
import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

export interface Player {
  id: string;
  nickname: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  teamId: string;
  birthDate: Date | null;
  image: string | null;
  shirtSize?: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

// Ensure uploads directory exists
const UPLOADS_DIR = join(process.cwd(), 'uploads', 'player-images');
await mkdir(UPLOADS_DIR, { recursive: true });

export async function createPlayer(data: {
  teamId?: string;
  nickname: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  birthDate?: Date;
  shirtSize?: string;
}): Promise<Player> {
  // Check if team exists
  if (data.teamId) {
    const [team] = await db.select().from(teams).where(eq(teams.id, data.teamId));
    if (!team) {
      throw new Error('Team not found');
    }
  }
  
  const [player] = await db.insert(players).values({
    nickname: data.nickname,
    firstName: data.firstName,
    lastName: data.lastName,
    email: data.email,
    teamId: data.teamId || null,
    birthDate: data.birthDate,
    shirtSize: data.shirtSize || null
  }).returning();
  
  // Create invitation if email is provided
  if (data.email) {
    const token = nanoid(48);
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7); // 7 days
    await db.insert(playerInvitations).values({
      playerId: player.id,
      email: data.email,
      token,
      expiresAt,
      status: 'pending'
    });
    // trigger magic link to the same email with callback to link page carrying invite token
    const backendUrl = process.env.BACKEND_PUBLIC_URL || `http://localhost:${process.env.BACKEND_PORT || 3000}`;
    const callbackURL = `${backendUrl}/api/players/link-invite?token=${token}`;
    // Trigger magic link email via HTTP to Better Auth handler
    await fetch(`${backendUrl}/api/auth/sign-in/magic-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: data.email, callbackURL })
    });
  }

  return player as Player;
}

export async function getPlayerById(id: string): Promise<Player> {
  const [player] = await db.select().from(players).where(eq(players.id, id));
  if (!player) {
    throw new Error('Player not found');
  }
  return player as Player;
}

export async function getPlayerSeasons(playerId: string): Promise<Array<{ seasonId: string; seasonName: string; teamId: string; teamName: string }>> {
  const rows = await db
    .select({
      seasonId: seasons.id,
      seasonName: seasons.name,
      teamId: teams.id,
      teamName: teams.name,
      captain: teamPlayers.captain,
    })
    .from(teamPlayers)
    .innerJoin(seasons, eq(teamPlayers.seasonId, seasons.id))
    .innerJoin(teams, eq(teamPlayers.teamId, teams.id))
    .where(eq(teamPlayers.playerId, playerId));

  return rows;
}

export async function getPlayersByTeam(teamId: string): Promise<Player[]> {
  const result = await db.select().from(players).where(eq(players.teamId, teamId));
  return result as Player[];
}

export async function getAllPlayers(): Promise<Player[]> {
  const result = await db.select().from(players);
  return result as Player[];
}

export async function getPlayersBySeason(seasonId: string): Promise<Player[]> {
  const result = await db
    .select({
      id: players.id,
      nickname: players.nickname,
      firstName: players.firstName,
      lastName: players.lastName,
      email: players.email,
      teamId: players.teamId,
      birthDate: players.birthDate,
      image: players.image,
      userId: players.userId,
      shirtSize: players.shirtSize,
      createdAt: players.createdAt,
      updatedAt: players.updatedAt,
    })
    .from(teamPlayers)
    .innerJoin(players, eq(teamPlayers.playerId, players.id))
    .where(eq(teamPlayers.seasonId, seasonId));
  return result as unknown as Player[];
}

export async function updatePlayer(id: string, data: {
  nickname?: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  teamId?: string;
  birthDate?: Date | null;
  shirtSize?: string | null;
}): Promise<Player> {
  const [player] = await db.select().from(players).where(eq(players.id, id));
  if (!player) {
    throw new Error('Player not found');
  }

  // If teamId is being updated, check if the new team exists
  if (data.teamId) {
    const [team] = await db.select().from(teams).where(eq(teams.id, data.teamId));
    if (!team) {
      throw new Error('Team not found');
    }
  }

  const [updatedPlayer] = await db.update(players)
    .set(data)
    .where(eq(players.id, id))
    .returning();

  return updatedPlayer as Player;
}

export async function uploadPlayerImage(id: string, image: File): Promise<Player> {
  const [player] = await db.select().from(players).where(eq(players.id, id));
  if (!player) {
    throw new Error('Player not found');
  }
  
  const fileName = `player-${id}-${nanoid()}.${image.name.split('.').pop()}`;
  const filePath = join(UPLOADS_DIR, fileName);
  
  // Save file to local storage
  const arrayBuffer = await image.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  await writeFile(filePath, buffer);
  
  // Update player with image path
  const [updatedPlayer] = await db.update(players)
    .set({ image: `/uploads/player-images/${fileName}` })
    .where(eq(players.id, id))
    .returning();
  
  return updatedPlayer as Player;
}

export async function deletePlayer(id: string): Promise<{ success: boolean }> {
  const [player] = await db.select().from(players).where(eq(players.id, id));
  if (!player) {
    throw new Error('Player not found');
  }
  
  await db.delete(players).where(eq(players.id, id));
  return { success: true };
} 