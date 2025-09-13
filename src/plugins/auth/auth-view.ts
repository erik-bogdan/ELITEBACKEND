import { Elysia } from "elysia";
import { auth } from "./auth";

export const betterAuth = new Elysia()
  .all("/api/auth/*", ({ request }) => auth.handler(request));
