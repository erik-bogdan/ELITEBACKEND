import { Elysia, t } from 'elysia';
import {
  createPlayer,
  getPlayerById,
  getPlayersByTeam,
  updatePlayer,
  uploadPlayerImage,
  deletePlayer
} from '../services/players/player.service';

export const playerRouter = new Elysia({ prefix: '/api/players' })
  .get('/team/:teamId', async ({ params }) => {
    return await getPlayersByTeam(params.teamId);
  }, {
    params: t.Object({
      teamId: t.String()
    }),
    detail: {
      summary: 'Get all players in a team',
      tags: ['Players']
    }
  })

  .get('/:id', async ({ params }) => {
    return await getPlayerById(params.id);
  }, {
    params: t.Object({
      id: t.String()
    }),
    detail: {
      summary: 'Get player by ID',
      tags: ['Players']
    }
  })

  .post('/', async ({ body }) => {
    return await createPlayer(body);
  }, {
    body: t.Object({
      name: t.String(),
      teamId: t.String(),
      birthDate: t.Optional(t.String())
    }),
    detail: {
      summary: 'Create a new player',
      tags: ['Players']
    }
  })

  .put('/:id', async ({ params, body }) => {
    return await updatePlayer(params.id, body);
  }, {
    params: t.Object({
      id: t.String()
    }),
    body: t.Object({
      name: t.Optional(t.String()),
      teamId: t.Optional(t.String()),
      birthDate: t.Optional(t.String())
    }),
    detail: {
      summary: 'Update a player',
      tags: ['Players']
    }
  })

  .post('/:id/image', async ({ params, body }) => {
    if (!body.file || !(body.file instanceof File)) {
      throw new Error('No file provided');
    }

    return await uploadPlayerImage(params.id, body.file);
  }, {
    params: t.Object({
      id: t.String()
    }),
    body: t.Object({
      file: t.Any()
    }),
    detail: {
      summary: 'Upload player image',
      tags: ['Players']
    }
  })

  .delete('/:id', async ({ params }) => {
    return await deletePlayer(params.id);
  }, {
    params: t.Object({
      id: t.String()
    }),
    detail: {
      summary: 'Delete a player',
      tags: ['Players']
    }
  }); 