import { Elysia, t } from 'elysia';
import { auth } from '../plugins/auth/auth';

export const appAuthRouter = new Elysia({ prefix: '/api/auth' })
  .get('/session', async ({ request }) => {
    try {
      const session = await auth.api.getSession({ headers: request.headers });
      return { user: session?.user ?? null, session: session?.session ?? null };
    } catch {
      return { user: null, session: null };
    }
  }, {
    detail: { summary: 'Get current session', tags: ['Auth'] }
  })
  // Compatibility endpoint for better-auth clients expecting /session/get
  .get('/session/get', async ({ request }) => {
    try {
      const session = await auth.api.getSession({ headers: request.headers });
      return { user: session?.user ?? null, session: session?.session ?? null };
    } catch {
      return { user: null, session: null };
    }
  }, {
    detail: { summary: 'Get current session (compat)', tags: ['Auth'] }
  })
  // Frontend végzi a jelszó beállítást, ezért ez az útvonal már nem szolgál UI-t.
  .post('/set-password', async ({ request, body, set }) => {
    try {
      const newPassword = (body as any)?.newPassword as string | undefined;
      if (!newPassword || newPassword.length < 8) {
        set.status = 400;
        return { error: true, message: 'A jelszó kötelező és legalább 8 karakter.' };
      }
      // Ensure session exists
      const session = await auth.api.getSession({ headers: request.headers });
      if (!session) {
        set.status = 401;
        return { error: true, message: 'Unauthorized' };
      }
      // Call Better Auth setPassword with compatible argument shapes
      try {
        // Variant 1: body.newPassword
        await auth.api.setPassword({ headers: request.headers, body: { newPassword } });
      } catch (e1: any) {
        if ((e1?.body?.code || e1?.code) === 'USER_ALREADY_HAS_A_PASSWORD') {
          return { success: true };
        }
        try {
          // Variant 1b: body.password
          await auth.api.setPassword({ headers: request.headers, body: { password: newPassword } as any } as any);
        } catch (e1b: any) {
          if ((e1b?.body?.code || e1b?.code) === 'USER_ALREADY_HAS_A_PASSWORD') {
            return { success: true };
          }
          try {
            // Variant 2: password at top-level
            await auth.api.setPassword({ headers: request.headers, password: newPassword } as any);
          } catch (e2: any) {
            if ((e2?.body?.code || e2?.code) === 'USER_ALREADY_HAS_A_PASSWORD') {
              return { success: true };
            }
            // Variant 3: updatePassword only if available
            try {
              const fn: any = (auth.api as any)?.updatePassword;
              if (typeof fn === 'function') {
                await fn({ headers: request.headers, body: { currentPassword: '', newPassword } });
              } else {
                throw new Error('updatePassword not available');
              }
            } catch (e3) {
              console.error('[set-password] all variants failed', { userId: session.user.id }, e1, e1b, e2, e3);
              set.status = 500;
              return { error: true, message: 'Nem sikerült a jelszó beállítása' };
            }
          }
        }
      }
      return { success: true };
    } catch (e) {
      set.status = 500;
      return { error: true, message: 'Nem sikerült a jelszó beállítása' };
    }
  }, {
    body: t.Object({ newPassword: t.String() }),
    detail: { summary: 'Set password for current session user', tags: ['Auth'] }
  });


