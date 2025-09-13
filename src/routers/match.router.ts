import { Elysia, t } from 'elysia';
import {
  createMatch,
  getMatchesByLeague,
  getMatchById,
  updateMatchResult,
  updateMatchStatus
} from '../services/matches/match.service';

export const matchRouter = new Elysia({ prefix: '/api/matches' })
  .get('/league/:leagueId', async ({ params }) => {
    return await getMatchesByLeague(params.leagueId);
  }, {
    params: t.Object({
      leagueId: t.String()
    }),
    detail: {
      summary: 'Get all matches in a league',
      tags: ['Matches']
    }
  })

  .get('/:id', async ({ params }) => {
    return await getMatchById(params.id);
  }, {
    params: t.Object({
      id: t.String()
    }),
    detail: {
      summary: 'Get match by ID',
      tags: ['Matches']
    }
  })

  .post('/', async ({ body }) => {
    return await createMatch({
      ...body,
      matchAt: new Date(body.matchAt)
    });
  }, {
    body: t.Object({
      leagueId: t.String(),
      homeTeamId: t.String(),
      awayTeamId: t.String(),
      matchAt: t.String(),
      matchStatus: t.Union([
        t.Literal('scheduled'),
        t.Literal('in_progress'),
        t.Literal('completed'),
        t.Literal('cancelled')
      ]),
      matchType: t.Union([
        t.Literal('regular'),
        t.Literal('playoff'),
        t.Literal('final')
      ]),
      matchRound: t.Number(),
      matchTable: t.Number()
    }),
    detail: {
      summary: 'Create a new match',
      tags: ['Matches']
    }
  })

  .put('/:id/result', async ({ params, body }) => {
    return await updateMatchResult(params.id, body);
  }, {
    params: t.Object({
      id: t.String()
    }),
    body: t.Object({
      homeTeamScore: t.Number(),
      awayTeamScore: t.Number(),
      homeTeamBestPlayerId: t.Optional(t.String()),
      awayTeamBestPlayerId: t.Optional(t.String())
    }),
    detail: {
      summary: 'Update match result and MVPs',
      tags: ['Matches']
    }
  })

  .put('/:id/status', async ({ params, body }) => {
    return await updateMatchStatus(params.id, body.status);
  }, {
    params: t.Object({
      id: t.String()
    }),
    body: t.Object({
      status: t.Union([
        t.Literal('scheduled'),
        t.Literal('in_progress'),
        t.Literal('completed'),
        t.Literal('cancelled')
      ])
    }),
    detail: {
      summary: 'Update match status',
      tags: ['Matches']
    }
  }); 