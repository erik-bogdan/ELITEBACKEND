import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { db } from '../../db';
import { players, teams, teamPlayers, seasons, playerInvitations, leagues, leagueTeams } from '../../database/schema';
import { and, eq, inArray } from 'drizzle-orm';
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
    
    // Send direct email with invite link (no magic link)
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
    const inviteUrl = `${frontendUrl}/auth/accept-invite?token=${encodeURIComponent(token)}`;
    
    // Send email using our email service
    const { EmailService } = await import('../email.service');
    const PlayerInviteEmail = (await import('../../emails/player-invite')).default;
    
    await EmailService.send({
      to: data.email,
      subject: 'Játékos meghívás - ELITE Beerpong',
      react: PlayerInviteEmail({
        inviteUrl,
        recipientName: data.firstName || data.nickname,
        teamName: undefined, // Will be set when player is assigned to team
        expiresAt: expiresAt.toLocaleDateString('hu-HU'),
        inviterName: 'ELITE Beerpong',
        supportEmail: 'sorpingpong@gmail.com'
      })
    });
  }

  return player as Player;
}

export async function getPlayerById(id: string): Promise<Player> {
  const [player] = await db.select().from(players).where(eq(players.id, id));
  if (!player) {
    throw new Error('Player not found');
  }
  const backendUrl = process.env.BACKEND_PUBLIC_URL || 'http://localhost:3555';
  
  return {
    ...player,
    image: player.image ? `${backendUrl}${player.image}` : `${backendUrl}/uploads/player-images/default.png`
  } as Player;
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
  const backendUrl = process.env.BACKEND_PUBLIC_URL || 'http://localhost:3555';
  
  return (result as Player[]).map(player => ({
    ...player,
    image: player.image ? `${backendUrl}${player.image}` : `${backendUrl}/uploads/player-images/default.png`
  }));
}

export async function getAllPlayers(): Promise<Player[]> {
  const result = await db.select().from(players);
  const backendUrl = process.env.BACKEND_PUBLIC_URL || 'http://localhost:3555';
  
  return (result as Player[]).map(player => ({
    ...player,
    image: player.image ? `${backendUrl}${player.image}` : `${backendUrl}/uploads/player-images/default.png`
  }));
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
  
  const backendUrl = process.env.BACKEND_PUBLIC_URL || 'http://localhost:3555';
  
  return (result as unknown as Player[]).map(player => ({
    ...player,
    image: player.image ? `${backendUrl}${player.image}` : `${backendUrl}/uploads/player-images/default.png`
  }));
}

export async function getPlayersFiltered(opts: { seasonId?: string; leagueId?: string; teamId?: string }): Promise<Player[]> {
  let teamIdsToFilter: string[] | undefined = undefined;

  // If leagueId is provided, get all teams in that league
  if (opts.leagueId) {
    const leagueTeamRows = await db
      .select({ teamId: leagueTeams.teamId })
      .from(leagueTeams)
      .where(eq(leagueTeams.leagueId, opts.leagueId));
    teamIdsToFilter = leagueTeamRows.map((row: any) => row.teamId).filter(Boolean);
    
    // If no teams in league, return empty array
    if (teamIdsToFilter.length === 0) {
      return [];
    }
  }

  // If teamId is provided, use only that team
  if (opts.teamId) {
    teamIdsToFilter = [opts.teamId];
  }

  // Build query conditions
  const conditions: any[] = [];
  
  if (opts.seasonId) {
    conditions.push(eq(teamPlayers.seasonId, opts.seasonId));
  }
  
  if (teamIdsToFilter && teamIdsToFilter.length > 0) {
    conditions.push(inArray(teamPlayers.teamId, teamIdsToFilter));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const result = await db
    .select({
      id: players.id,
      nickname: players.nickname,
      firstName: players.firstName,
      lastName: players.lastName,
      email: players.email,
      teamId: teamPlayers.teamId, // Use teamId from teamPlayers, not from players
      birthDate: players.birthDate,
      image: players.image,
      userId: players.userId,
      shirtSize: players.shirtSize,
      createdAt: players.createdAt,
      updatedAt: players.updatedAt,
    })
    .from(teamPlayers)
    .innerJoin(players, eq(teamPlayers.playerId, players.id))
    .where(whereClause as any);
  
  const backendUrl = process.env.BACKEND_PUBLIC_URL || 'http://localhost:3555';
  
  return (result as unknown as Player[]).map(player => ({
    ...player,
    image: player.image ? `${backendUrl}${player.image}` : `${backendUrl}/uploads/player-images/default.png`
  }));
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