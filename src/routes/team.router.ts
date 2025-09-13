import { Elysia, t } from 'elysia';
import {
  createTeam,
  getAllTeams,
  getTeamById,
  getTeamBySlug,
  updateTeam,
  uploadTeamLogo,
  deleteTeam,
  getTeamPlayersBySeason,
  getAvailablePlayersForTeamSeason,
  assignPlayerToTeamSeason,
  unassignPlayerFromTeamSeason
} from '../services/teams/team.service';
import { db } from '../db';
import { leagues, seasons, teamPlayers, players, teams } from '../database/schema';
import { eq, and } from 'drizzle-orm';
import TeamInviteEmail from '../emails/invite';
import { EmailService } from '../services/email.service';

export const teamRouter = new Elysia({ prefix: '/api/teams' })
  .get('/', async () => {
    return await getAllTeams();
  }, {
    detail: {
      summary: 'Get all teams',
      tags: ['Teams']
    }
  })

  .get('/:id', async ({ params }) => {
    return await getTeamById(params.id);
  }, {
    params: t.Object({
      id: t.String()
    }),
    detail: {
      summary: 'Get team by ID',
      tags: ['Teams']
    }
  })

  .get('/slug/:slug', async ({ params }) => {
    return await getTeamBySlug(params.slug);
  }, {
    params: t.Object({
      slug: t.String()
    }),
    detail: {
      summary: 'Get team by slug',
      tags: ['Teams']
    }
  })

  .post('/', async ({ body }) => {
    return await createTeam({
      ...body,
      players: body.players?.map((player: any) => ({
        ...player,
        birthDate: player.birthDate ? new Date(player.birthDate) : undefined
      }))
    });
  }, {
    body: t.Object({
      name: t.String(),
      description: t.Optional(t.String()),
      properties: t.Optional(t.Record(t.String(), t.Any())),
      players: t.Optional(t.Array(t.Union([
        t.Object({
          id: t.String()
        }),
        t.Object({
          nickname: t.String(),
          firstName: t.Optional(t.String()),
          lastName: t.Optional(t.String()),
          email: t.Optional(t.String()),
          birthDate: t.Optional(t.String())
        })
      ])))
    }),
    detail: {
      summary: 'Create a new team with optional players',
      tags: ['Teams']
    }
  })

  .put('/:id', async ({ params, body }) => {
    return await updateTeam(params.id, body);
  }, {
    params: t.Object({
      id: t.String()
    }),
    body: t.Object({
      name: t.Optional(t.String()),
      description: t.Optional(t.String()),
      properties: t.Optional(t.Record(t.String(), t.Any()))
    }),
    detail: {
      summary: 'Update a team',
      tags: ['Teams']
    }
  })

  .post('/:id/logo', async ({ params, body }) => {
    if (!body.file || !(body.file instanceof File)) {
      throw new Error('No file provided');
    }

    return await uploadTeamLogo(params.id, body.file);
  }, {
    params: t.Object({
      id: t.String()
    }),
    body: t.Object({
      file: t.Any()
    }),
    detail: {
      summary: 'Upload team logo',
      tags: ['Teams']
    }
  })

  .delete('/:id', async ({ params }) => {
    return await deleteTeam(params.id);
  }, {
    params: t.Object({
      id: t.String()
    }),
    detail: {
      summary: 'Delete a team',
      tags: ['Teams']
    }
  })
  // removed legacy send-invite endpoint in favor of championship route
  // New season-scoped players endpoints
  .get('/:id/players', async ({ params, query }) => {
    if (!query.seasonId) throw new Error('seasonId is required');
    return await getTeamPlayersBySeason(params.id, String(query.seasonId));
  }, {
    params: t.Object({ id: t.String() }),
    query: t.Object({ seasonId: t.String() }),
    detail: { summary: 'List players of a team for a season', tags: ['Teams'] }
  })
  .get('/:id/players/available', async ({ params, query }) => {
    if (!query.seasonId) throw new Error('seasonId is required');
    try {
      return await getAvailablePlayersForTeamSeason(params.id, String(query.seasonId));
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : 'Failed to load available players');
    }
  }, {
    params: t.Object({ id: t.String() }),
    query: t.Object({ seasonId: t.String() }),
    detail: { summary: 'List available players not yet assigned for the season', tags: ['Teams'] }
  })
  .post('/:id/players/:playerId', async ({ params, body }) => {
    if (!body.seasonId) throw new Error('seasonId is required');
    return await assignPlayerToTeamSeason(params.id, params.playerId, body.seasonId, body.captain);
  }, {
    params: t.Object({ id: t.String(), playerId: t.String() }),
    body: t.Object({ seasonId: t.String(), captain: t.Optional(t.Boolean()) }),
    detail: { summary: 'Assign player to team for a season', tags: ['Teams'] }
  })
  .delete('/:id/players/:playerId', async ({ params, query }) => {
    if (!query.seasonId) throw new Error('seasonId is required');
    return await unassignPlayerFromTeamSeason(params.id, params.playerId, String(query.seasonId));
  }, {
    params: t.Object({ id: t.String(), playerId: t.String() }),
    query: t.Object({ seasonId: t.String() }),
    detail: { summary: 'Unassign player from team for a season', tags: ['Teams'] }
  });