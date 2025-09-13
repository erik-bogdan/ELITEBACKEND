import { Elysia } from 'elysia';
import { 
  createSeason,
  getSeason,
  getAllSeasons,
  updateSeason,
  deleteSeason
} from '../services/seasons/season.service';

export const seasonRouter = new Elysia({ prefix: '/season' })
  .post('/', async ({ body, set }) => {
    try {
      return await createSeason(body as any);
    } catch (error) {
      set.status = 400;
      return {
        error: true,
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }, {
    detail: {
      tags: ['Seasons']
    }
  })
  .get('/', async () => {
    return await getAllSeasons();
  }, {
    detail: {
      tags: ['Seasons']
    }
  })
  .get('/:id', async ({ params: { id }, set }) => {
    try {
      const season = await getSeason(id);
      if (!season) {
        set.status = 404;
        return {
          error: true,
          message: 'Season not found'
        };
      }
      return season;
    } catch (error) {
      set.status = 400;
      return {
        error: true,
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }, {
    detail: {
      tags: ['Seasons']
    }
  })
  .put('/:id', async ({ params: { id }, body, set }) => {
    try {
      const season = await updateSeason(id, body as any);
      if (!season) {
        set.status = 404;
        return {
          error: true,
          message: 'Season not found'
        };
      }
      return season;
    } catch (error) {
      set.status = 400;
      return {
        error: true,
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }, {
    detail: {
      tags: ['Seasons']
    }
  })
  .delete('/:id', async ({ params: { id }, set }) => {
    try {
      const success = await deleteSeason(id);
      if (!success) {
        set.status = 404;
        return {
          error: true,
          message: 'Season not found'
        };
      }
      return { success: true };
    } catch (error) {
      set.status = 400;
      return {
        error: true,
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }, {
    detail: {
      tags: ['Seasons']
    }
  }); 