import { Elysia, t } from 'elysia';
import { db } from '../db';
import { systemLogs, user } from '../database/schema';
import { eq, desc, sql } from 'drizzle-orm';
import { auth } from '../plugins/auth/auth';

export const logsRouter = new Elysia({ prefix: '/api/logs' })
  .get('/', async ({ request, set, query }) => {
    try {
      const session = await auth.api.getSession({ headers: request.headers });
      if (!session) {
        set.status = 401;
        return { error: true, message: 'Unauthorized' };
      }

      // Check if user is admin (you might want to add proper role checking)
      // For now, we'll allow any authenticated user to view logs
      
      const page = parseInt(query.page || '1') || 1;
      const limit = parseInt(query.limit || '50') || 50;
      const offset = (page - 1) * limit;

      // Get logs with user information
      const logs = await db
        .select({
          id: systemLogs.id,
          datetime: systemLogs.datetime,
          type: systemLogs.type,
          operation: systemLogs.operation,
          metadata: systemLogs.metadata,
          createdAt: systemLogs.createdAt,
          userName: user.name,
          userEmail: user.email,
          userNickname: user.nickname
        })
        .from(systemLogs)
        .leftJoin(user, eq(systemLogs.userId, user.id))
        .orderBy(desc(systemLogs.datetime))
        .limit(limit)
        .offset(offset);

      // Get total count
      const [totalResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(systemLogs);

      const total = Number(totalResult?.count || 0);

      return {
        logs,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      set.status = 500;
      return { 
        error: true, 
        message: error instanceof Error ? error.message : 'Unknown error occurred' 
      };
    }
  }, {
    query: t.Object({
      page: t.Optional(t.String()),
      limit: t.Optional(t.String())
    }),
    detail: {
      summary: 'Get system logs with pagination',
      tags: ['Logs']
    }
  });
