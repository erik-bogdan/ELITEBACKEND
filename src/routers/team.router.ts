import { Elysia, t } from 'elysia';
import {
  createTeam,
  getAllTeams,
  getTeamById,
  getTeamBySlug,
  updateTeam,
  uploadTeamLogo,
  deleteTeam
} from '../services/teams/team.service';

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
    return await createTeam(body);
  }, {
    body: t.Object({
      name: t.String(),
      description: t.Optional(t.String()),
      properties: t.Optional(t.Record(t.String(), t.Any()))
    }),
    detail: {
      summary: 'Create a new team',
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
  }); 