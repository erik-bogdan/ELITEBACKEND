import { Elysia, t } from 'elysia';
import { db } from '../db';
import { players, user as userTable } from '../database/schema';
import { and, eq, like, sql } from 'drizzle-orm';
import { auth } from '../plugins/auth/auth';
import { LoggingService } from '../services/logging.service';

export const adminUsersRouter = new Elysia({ prefix: '/api/admin/users' })
  // List users with basic info
  .get('/', async ({ request, set, query }) => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) { set.status = 401; return { error: true, message: 'Unauthorized' }; }

    const page = parseInt((query as any).page || '1') || 1;
    const limit = parseInt((query as any).limit || '50') || 50;
    const offset = (page - 1) * limit;
    const q = String((query as any).q || '').trim();

    const where = q
      ? like(userTable.email, `%${q}%`)
      : undefined as any;

    const rows = await db
      .select({
        id: userTable.id,
        email: userTable.email,
        name: userTable.name,
        nickname: userTable.nickname,
        role: userTable.role,
        createdAt: userTable.createdAt,
        updatedAt: userTable.updatedAt,
        playerId: sql<string | null>`min(${players.id}::text)`,
        playerNickname: sql<string | null>`min(${players.nickname})`,
        playerFirstName: sql<string | null>`min(${players.firstName})`,
        playerLastName: sql<string | null>`min(${players.lastName})`,
      })
      .from(userTable)
      .leftJoin(players, eq(players.userId, userTable.id))
      .where(where as any)
      .groupBy(
        userTable.id,
        userTable.email,
        userTable.name,
        userTable.nickname,
        userTable.role,
        userTable.createdAt,
        userTable.updatedAt
      )
      .limit(limit)
      .offset(offset);

    // basic total (without filter accuracy for brevity)
    const total = (await db.select().from(userTable)).length;

    return { users: rows, pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } };
  }, {
    query: t.Object({ page: t.Optional(t.String()), limit: t.Optional(t.String()), q: t.Optional(t.String()) })
  })

  // Create user via auth provider
  .post('/', async ({ request, body, set }) => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) { set.status = 401; return { error: true, message: 'Unauthorized' }; }
    const payload = body as any;
    try {
      const created = await auth.api.createUser({ body: { email: payload.email, password: payload.password, name: payload.name, role: payload.role || 'user', data: { nickname: payload.nickname || '', lang: payload.lang || 'hu' } } } as any);
      try {
        await LoggingService.logCustom(session.user.id, 'user', `Felhasználó létrehozva: ${payload.email} (${payload.role || 'user'})`, { userEmail: payload.email, role: payload.role || 'user' });
      } catch {}
      return { success: true, user: created?.user ?? null };
    } catch (e: any) {
      set.status = 400;
      return { error: true, message: e?.message || 'Failed to create user' };
    }
  }, {
    body: t.Object({ email: t.String(), password: t.String(), name: t.Optional(t.String()), nickname: t.Optional(t.String()), role: t.Optional(t.String()), lang: t.Optional(t.String()) })
  })

  // Update user basic fields (name, nickname, role)
  .put('/:id', async ({ request, params, body, set }) => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) { set.status = 401; return { error: true, message: 'Unauthorized' }; }
    const { id } = params as any;
    const { name, nickname, role } = body as any;
    const [before] = await db.select().from(userTable).where(eq(userTable.id, id));
    const patch: any = {};
    if (typeof name === 'string') patch.name = name;
    if (typeof nickname === 'string') patch.nickname = nickname;
    if (typeof role === 'string') patch.role = role;
    if (Object.keys(patch).length === 0) return { success: true };
    const [updated] = await db.update(userTable).set(patch).where(eq(userTable.id, id)).returning();
    if (!updated) { set.status = 404; return { error: true, message: 'User not found' }; }
    try {
      const changes: string[] = [];
      if (before) {
        if (patch.name && patch.name !== (before as any).name) changes.push(`név: "${(before as any).name || ''}" → "${patch.name}"`);
        if (patch.nickname && patch.nickname !== (before as any).nickname) changes.push(`becenév: "${(before as any).nickname || ''}" → "${patch.nickname}"`);
        if (patch.role && patch.role !== (before as any).role) changes.push(`szerep: "${(before as any).role || ''}" → "${patch.role}"`);
      }
      const desc = changes.length > 0 ? changes.join(', ') : 'módosítás történt';
      await LoggingService.logCustom(session.user.id, 'user', `Felhasználó módosítva: ${(before as any)?.email || id} (${desc})`, { userId: id, changes: patch });
    } catch {}
    return { success: true, user: updated };
  }, {
    params: t.Object({ id: t.String() }),
    body: t.Object({ name: t.Optional(t.String()), nickname: t.Optional(t.String()), role: t.Optional(t.String()) })
  })

  // Link player to user
  .post('/:id/link-player/:playerId', async ({ request, params, set }) => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) { set.status = 401; return { error: true, message: 'Unauthorized' }; }
    const { id, playerId } = params as any;
    const [pl] = await db.select().from(players).where(eq(players.id, playerId));
    const [usr] = await db.select().from(userTable).where(eq(userTable.id, id));
    if (!pl) { set.status = 404; return { error: true, message: 'Player not found' }; }
    const [updated] = await db.update(players).set({ userId: id }).where(eq(players.id, playerId)).returning();
    try {
      const playerName = `${(pl as any).firstName || ''} ${(pl as any).lastName || ''}`.trim() || (pl as any).nickname || String(playerId);
      await LoggingService.logCustom(session.user.id, 'user', `Játékos csatolva felhasználóhoz: ${(usr as any)?.email || id} ← ${playerName}`, { userId: id, playerId });
    } catch {}
    return { success: true, player: updated };
  }, {
    params: t.Object({ id: t.String(), playerId: t.String() })
  })

  // Unlink player from user
  .delete('/:id/link-player/:playerId', async ({ request, params, set }) => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) { set.status = 401; return { error: true, message: 'Unauthorized' }; }
    const { id, playerId } = params as any;
    const [pl] = await db.select().from(players).where(eq(players.id, playerId));
    const [updated] = await db.update(players).set({ userId: null }).where(eq(players.id, playerId)).returning();
    try {
      const playerName = pl ? (`${(pl as any).firstName || ''} ${(pl as any).lastName || ''}`.trim() || (pl as any).nickname || String(playerId)) : String(playerId);
      await LoggingService.logCustom(session.user.id, 'user', `Játékos leválasztva a felhasználóról: ${playerName}`, { userId: id, playerId });
    } catch {}
    return { success: true, player: updated };
  }, {
    params: t.Object({ id: t.String(), playerId: t.String() })
  })

  // Attempt direct password reset for a user; if not supported, return error
  .post('/:id/password', async ({ request, params, body, set }) => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) { set.status = 401; return { error: true, message: 'Unauthorized' }; }
    const { id } = params as any;
    const { newPassword } = body as any;
    try {
      // Not all adapters support admin-set password. Expose graceful error if not available.
      const anyApi: any = auth.api as any;
      if (typeof anyApi.adminSetPassword === 'function') {
        await anyApi.adminSetPassword({ body: { userId: id, password: newPassword } });
        try { await LoggingService.logCustom(session.user.id, 'user', `Jelszó módosítva a felhasználónál: ${id}`, { userId: id }); } catch {}
        return { success: true };
      }
      set.status = 400;
      return { error: true, message: 'Direct password set not supported; use magic link flow' };
    } catch (e: any) {
      set.status = 400;
      return { error: true, message: e?.message || 'Failed to set password' };
    }
  }, {
    params: t.Object({ id: t.String() }),
    body: t.Object({ newPassword: t.String() })
  })

  // Send magic-link for user to sign-in and then set password via UI
  .post('/:id/send-set-password', async ({ request, params, set }) => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) { set.status = 401; return { error: true, message: 'Unauthorized' }; }
    const { id } = params as any;
    const [usr] = await db.select().from(userTable).where(eq(userTable.id, id));
    if (!usr) { set.status = 404; return { error: true, message: 'User not found' }; }
    const backendUrl = process.env.BACKEND_PUBLIC_URL || `http://localhost:${process.env.BACKEND_PORT || 3000}`;
    const callbackURL = `${backendUrl}/auth/set-password`;
    try {
      await fetch(`${backendUrl}/api/auth/sign-in/magic-link`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: usr.email, callbackURL }) });
      try { await LoggingService.logCustom(session.user.id, 'user', `Magic link elküldve jelszó beállításához: ${(usr as any).email}`, { userId: id }); } catch {}
      return { success: true };
    } catch (e: any) {
      set.status = 500; return { error: true, message: e?.message || 'Failed to send magic link' };
    }
  }, {
    params: t.Object({ id: t.String() })
  });

export default adminUsersRouter;

