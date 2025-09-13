import { Elysia } from "elysia";
import { auth } from "../plugins/auth/auth";
 
// user middleware (compute user and session and pass to routes)
export const betterAuthMiddleware = new Elysia({ name: "better-auth" })
  .mount(auth.handler)
  .macro({
    auth: {
      async resolve({ error, request: { headers } }) {
        const session = await auth.api.getSession({
          headers,
        });
 
        if (!session) return error(401);
 
        return {
          user: session.user,
          session: session.session,
        };
      },
    },
  });