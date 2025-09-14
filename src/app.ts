import { Elysia } from 'elysia'
import { swagger } from '@elysiajs/swagger'
import { cors } from '@elysiajs/cors'
import { staticPlugin } from '@elysiajs/static'
import { routers } from './routes/index';
import { betterAuth } from './plugins/auth/auth-view';
import { auth } from './plugins/auth/auth';

export const app = new Elysia()
  .use(swagger())
  .use(betterAuth)
  .use(routers)
  .use(staticPlugin({
    assets: 'uploads',
    prefix: '/uploads',
  }))
  .use(
      cors({
        origin: ["localhost:3000", "localhost:3001", "localhost:3002", "localhost:3003", "elite-fe-five.vercel.app", "elitebeerpong.hu", "elite.sorpingpong.hu"],
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        credentials: true,
        allowedHeaders: ["Content-Type", "Authorization"],
      }),
    )

