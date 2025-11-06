import { db } from '../../db';
import { liveMatchesGroup, liveMatchesGroupMatches, matches, teams, liveMatchPoll, liveMatchPollOption, liveMatchPollVote } from '../../database/schema';
import { eq, and, asc, sql, inArray, ne } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

export interface CreateLiveMatchGroupInput {
  name: string;
}

export interface AddMatchToGroupInput {
  groupId: string;
  matchId: string;
}

export interface CreatePollInput {
  groupMatchId: string;
  question: string;
  options: string[];
}

export interface UpdatePollInput {
  question?: string;
  options?: Array<{ id?: string; text: string; order: number }>;
}

export interface VoteInput {
  pollId: string;
  optionId: string;
  anonymousUserId: string; // Generated UUID from cookie
}

export async function createLiveMatchGroup(data: CreateLiveMatchGroupInput) {
  // Create group
  const [group] = await db.insert(liveMatchesGroup).values({
    name: data.name
  }).returning();

  return group;
}

export async function getAllLiveMatchGroups() {
  // Get all groups
  const groups = await db.select().from(liveMatchesGroup)
    .orderBy(asc(liveMatchesGroup.createdAt));

  // For each group, get the count of matches
  const groupsWithCounts = await Promise.all(groups.map(async (group) => {
    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(liveMatchesGroupMatches)
      .where(eq(liveMatchesGroupMatches.groupId, group.id));
    return {
      ...group,
      matchCount: Number(result?.count || 0)
    };
  }));

  return groupsWithCounts;
}

export async function activateLiveMatchGroup(groupId: string) {
  // Check if group exists
  const [group] = await db.select().from(liveMatchesGroup).where(eq(liveMatchesGroup.id, groupId));
  if (!group) {
    throw new Error('Group not found');
  }

  // Deactivate all other groups
  await db.update(liveMatchesGroup)
    .set({ active: false, updatedAt: new Date() })
    .where(ne(liveMatchesGroup.id, groupId));

  // Activate this group
  const [updated] = await db.update(liveMatchesGroup)
    .set({ active: true, updatedAt: new Date() })
    .where(eq(liveMatchesGroup.id, groupId))
    .returning();

  return updated;
}

export async function updateLiveMatchGroup(groupId: string, name: string) {
  // Check if group exists
  const [existing] = await db.select().from(liveMatchesGroup).where(eq(liveMatchesGroup.id, groupId));
  if (!existing) {
    throw new Error('Group not found');
  }

  // Update group
  const [updated] = await db.update(liveMatchesGroup)
    .set({ name, updatedAt: new Date() })
    .where(eq(liveMatchesGroup.id, groupId))
    .returning();

  return updated;
}

export async function deleteLiveMatchGroup(groupId: string) {
  // Check if group exists
  const [existing] = await db.select().from(liveMatchesGroup).where(eq(liveMatchesGroup.id, groupId));
  if (!existing) {
    throw new Error('Group not found');
  }

  // Delete group (cascade will delete matches)
  await db.delete(liveMatchesGroup).where(eq(liveMatchesGroup.id, groupId));

  return { success: true };
}

export async function getLiveMatchGroupWithMatches(groupId: string) {
  // Get group
  const [group] = await db.select().from(liveMatchesGroup).where(eq(liveMatchesGroup.id, groupId));
  if (!group) {
    throw new Error('Group not found');
  }

  // Get match IDs in this group
  const groupMatches = await db.select({ matchId: liveMatchesGroupMatches.matchId })
    .from(liveMatchesGroupMatches)
    .where(eq(liveMatchesGroupMatches.groupId, groupId));

  const matchIds = groupMatches.map(gm => gm.matchId);

  if (matchIds.length === 0) {
    return {
      ...group,
      matches: []
    };
  }

  // Get full match data with teams
  const homeTeams = alias(teams, 'home_teams');
  const awayTeams = alias(teams, 'away_teams');

  const matchesData = await db.select({
    id: liveMatchesGroupMatches.id, // Include junction table ID
    match: {
      id: matches.id,
      leagueId: matches.leagueId,
      homeTeamId: matches.homeTeamId,
      awayTeamId: matches.awayTeamId,
      homeTeamScore: matches.homeTeamScore,
      awayTeamScore: matches.awayTeamScore,
      matchAt: matches.matchAt,
      matchDate: matches.matchDate,
      matchTime: matches.matchTime,
      matchStatus: matches.matchStatus,
      matchRound: matches.matchRound,
      gameDay: matches.gameDay,
      matchTable: matches.matchTable,
      isDelayed: matches.isDelayed,
      delayedRound: matches.delayedRound,
      delayedGameDay: matches.delayedGameDay,
      delayedDate: matches.delayedDate,
      delayedTime: matches.delayedTime,
      delayedTable: matches.delayedTable,
    },
    homeTeam: homeTeams,
    awayTeam: awayTeams,
  })
    .from(liveMatchesGroupMatches)
    .innerJoin(matches, eq(liveMatchesGroupMatches.matchId, matches.id))
    .leftJoin(homeTeams, eq(matches.homeTeamId, homeTeams.id))
    .leftJoin(awayTeams, eq(matches.awayTeamId, awayTeams.id))
    .where(eq(liveMatchesGroupMatches.groupId, groupId))
    .orderBy(asc(matches.matchAt), asc(matches.matchTable));

  return {
    ...group,
    matches: matchesData
  };
}

export async function addMatchToGroup(data: AddMatchToGroupInput) {
  // Check if group exists
  const [group] = await db.select().from(liveMatchesGroup).where(eq(liveMatchesGroup.id, data.groupId));
  if (!group) {
    throw new Error('Group not found');
  }

  // Check if match exists
  const [match] = await db.select().from(matches).where(eq(matches.id, data.matchId));
  if (!match) {
    throw new Error('Match not found');
  }

  // Check if match is already in group
  const [existing] = await db.select()
    .from(liveMatchesGroupMatches)
    .where(
      and(
        eq(liveMatchesGroupMatches.groupId, data.groupId),
        eq(liveMatchesGroupMatches.matchId, data.matchId)
      )
    );

  if (existing) {
    throw new Error('Match is already in this group');
  }

  // Add match to group
  const [added] = await db.insert(liveMatchesGroupMatches).values({
    groupId: data.groupId,
    matchId: data.matchId
  }).returning();

  return added;
}

export async function getGroupsForMatch(matchId: string) {
  // Get all groups that contain this match
  const groupMatches = await db.select({ 
    groupId: liveMatchesGroupMatches.groupId 
  })
    .from(liveMatchesGroupMatches)
    .where(eq(liveMatchesGroupMatches.matchId, matchId));

  if (groupMatches.length === 0) {
    return { groups: [] };
  }

  const groupIds = groupMatches.map(gm => gm.groupId);
  
  const groups = await db.select().from(liveMatchesGroup)
    .where(inArray(liveMatchesGroup.id, groupIds))
    .orderBy(asc(liveMatchesGroup.createdAt));

  return { groups };
}

export async function removeMatchFromGroup(groupId: string, matchId: string) {
  // Check if relationship exists
  const [existing] = await db.select()
    .from(liveMatchesGroupMatches)
    .where(
      and(
        eq(liveMatchesGroupMatches.groupId, groupId),
        eq(liveMatchesGroupMatches.matchId, matchId)
      )
    );

  if (!existing) {
    throw new Error('Match is not in this group');
  }

  // Remove match from group
  await db.delete(liveMatchesGroupMatches)
    .where(
      and(
        eq(liveMatchesGroupMatches.groupId, groupId),
        eq(liveMatchesGroupMatches.matchId, matchId)
      )
    );

  return { success: true };
}

// Poll functions
export async function createPoll(data: CreatePollInput) {
  // Check if groupMatch exists
  const [groupMatch] = await db.select()
    .from(liveMatchesGroupMatches)
    .where(eq(liveMatchesGroupMatches.id, data.groupMatchId));
  
  if (!groupMatch) {
    throw new Error('Group match not found');
  }

  // Check if poll already exists for this groupMatch
  const [existing] = await db.select()
    .from(liveMatchPoll)
    .where(eq(liveMatchPoll.groupMatchId, data.groupMatchId));
  
  if (existing) {
    throw new Error('Poll already exists for this match');
  }

  // Create poll
  const [poll] = await db.insert(liveMatchPoll).values({
    groupMatchId: data.groupMatchId,
    question: data.question
  }).returning();

  // Create options
  const options = await Promise.all(data.options.map((text, index) => 
    db.insert(liveMatchPollOption).values({
      pollId: poll.id,
      text,
      order: index
    }).returning()
  ));

  return { ...poll, options: options.map(o => o[0]) };
}

export async function getPollByGroupMatchId(groupMatchId: string) {
  const [poll] = await db.select()
    .from(liveMatchPoll)
    .where(eq(liveMatchPoll.groupMatchId, groupMatchId));

  if (!poll) {
    return null;
  }

  const options = await db.select()
    .from(liveMatchPollOption)
    .where(eq(liveMatchPollOption.pollId, poll.id))
    .orderBy(asc(liveMatchPollOption.order));

  // Get vote counts for each option
  const voteCounts = await Promise.all(options.map(async (option) => {
    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(liveMatchPollVote)
      .where(eq(liveMatchPollVote.optionId, option.id));
    return { optionId: option.id, count: Number(result?.count || 0) };
  }));

  const optionsWithCounts = options.map(option => {
    const voteCount = voteCounts.find(vc => vc.optionId === option.id);
    return { ...option, voteCount: voteCount?.count || 0 };
  });

  return { ...poll, options: optionsWithCounts };
}

export async function updatePoll(pollId: string, data: UpdatePollInput) {
  const [existing] = await db.select()
    .from(liveMatchPoll)
    .where(eq(liveMatchPoll.id, pollId));
  
  if (!existing) {
    throw new Error('Poll not found');
  }

  // Update question if provided
  if (data.question) {
    await db.update(liveMatchPoll)
      .set({ question: data.question, updatedAt: new Date() })
      .where(eq(liveMatchPoll.id, pollId));
  }

  // Update options if provided
  if (data.options) {
    // Delete existing options
    await db.delete(liveMatchPollOption)
      .where(eq(liveMatchPollOption.pollId, pollId));

    // Insert new options
    await Promise.all(data.options.map((opt) =>
      db.insert(liveMatchPollOption).values({
        pollId,
        text: opt.text,
        order: opt.order
      })
    ));
  }

  return await getPollByGroupMatchId(existing.groupMatchId);
}

export async function deletePoll(pollId: string) {
  const [existing] = await db.select()
    .from(liveMatchPoll)
    .where(eq(liveMatchPoll.id, pollId));
  
  if (!existing) {
    throw new Error('Poll not found');
  }

  // Delete poll (cascade will delete options and votes)
  await db.delete(liveMatchPoll).where(eq(liveMatchPoll.id, pollId));

  return { success: true };
}

export async function voteOnPoll(data: VoteInput) {
  // Check if poll exists
  const [poll] = await db.select()
    .from(liveMatchPoll)
    .where(eq(liveMatchPoll.id, data.pollId));
  
  if (!poll) {
    throw new Error('Poll not found');
  }

  // Check if option belongs to poll
  const [option] = await db.select()
    .from(liveMatchPollOption)
    .where(and(
      eq(liveMatchPollOption.id, data.optionId),
      eq(liveMatchPollOption.pollId, data.pollId)
    ));
  
  if (!option) {
    throw new Error('Invalid option for this poll');
  }

  // Check if user already voted (anonymous UUID from cookie)
  const [existing] = await db.select()
    .from(liveMatchPollVote)
    .where(and(
      eq(liveMatchPollVote.pollId, data.pollId),
      eq(liveMatchPollVote.anonymousUserId, data.anonymousUserId)
    ));
  
  if (existing) {
    // Update existing vote
    await db.update(liveMatchPollVote)
      .set({ optionId: data.optionId })
      .where(eq(liveMatchPollVote.id, existing.id));
    return { success: true, updated: true };
  }
  
  // Create new vote
  await db.insert(liveMatchPollVote).values({
    pollId: data.pollId,
    optionId: data.optionId,
    anonymousUserId: data.anonymousUserId
  });

  return { success: true, updated: false };
}

export async function getUserVote(pollId: string, anonymousUserId: string) {
  const [vote] = await db.select()
    .from(liveMatchPollVote)
    .where(and(
      eq(liveMatchPollVote.pollId, pollId),
      eq(liveMatchPollVote.anonymousUserId, anonymousUserId)
    ));

  if (!vote) {
    return null;
  }

  return { optionId: vote.optionId };
}

// Get active live match group with matches and polls (public endpoint)
export async function getActiveLiveMatchGroup() {
  // Get active group
  const [activeGroup] = await db.select()
    .from(liveMatchesGroup)
    .where(eq(liveMatchesGroup.active, true))
    .limit(1);

  if (!activeGroup) {
    return null;
  }

  // Get matches for this group
  const groupMatches = await db.select({ matchId: liveMatchesGroupMatches.matchId })
    .from(liveMatchesGroupMatches)
    .where(eq(liveMatchesGroupMatches.groupId, activeGroup.id));

  const matchIds = groupMatches.map(gm => gm.matchId);

  if (matchIds.length === 0) {
    return {
      ...activeGroup,
      matches: []
    };
  }

  // Get full match data with teams
  const homeTeams = alias(teams, 'home_teams');
  const awayTeams = alias(teams, 'away_teams');

  const matchesData = await db.select({
    id: liveMatchesGroupMatches.id, // Junction table ID (groupMatchId)
    match: {
      id: matches.id,
      leagueId: matches.leagueId,
      homeTeamId: matches.homeTeamId,
      awayTeamId: matches.awayTeamId,
      homeTeamScore: matches.homeTeamScore,
      awayTeamScore: matches.awayTeamScore,
      matchAt: matches.matchAt,
      matchDate: matches.matchDate,
      matchTime: matches.matchTime,
      matchStatus: matches.matchStatus,
      matchRound: matches.matchRound,
      gameDay: matches.gameDay,
      matchTable: matches.matchTable,
      isDelayed: matches.isDelayed,
      delayedRound: matches.delayedRound,
      delayedGameDay: matches.delayedGameDay,
      delayedDate: matches.delayedDate,
      delayedTime: matches.delayedTime,
      delayedTable: matches.delayedTable,
    },
    homeTeam: homeTeams,
    awayTeam: awayTeams,
  })
    .from(liveMatchesGroupMatches)
    .innerJoin(matches, eq(liveMatchesGroupMatches.matchId, matches.id))
    .leftJoin(homeTeams, eq(matches.homeTeamId, homeTeams.id))
    .leftJoin(awayTeams, eq(matches.awayTeamId, awayTeams.id))
    .where(eq(liveMatchesGroupMatches.groupId, activeGroup.id))
    .orderBy(asc(matches.matchAt), asc(matches.matchTable));

  // Get polls for each match
  const matchesWithPolls = await Promise.all(matchesData.map(async (matchData) => {
    const poll = await getPollByGroupMatchId(matchData.id);
    return {
      ...matchData,
      poll: poll || null
    };
  }));

  return {
    ...activeGroup,
    matches: matchesWithPolls
  };
}

