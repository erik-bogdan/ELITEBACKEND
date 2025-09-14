import { championshipRouter } from "./championship.router";
import { teamRouter } from "./team.router";
import { playerRouter } from "./player.router";
import { matchRouter } from "./match.router";
import { seasonRouter } from "./season.router";
import { appAuthRouter } from "./auth.router";
import { applyRouter } from "./apply.router";
import { userRouter } from "./user.router";
import { logsRouter } from "./logs.router";
import { adminUsersRouter } from "./admin.users.router";

export const routers = [
  championshipRouter,
  teamRouter,
  playerRouter,
  matchRouter,
  seasonRouter,
  appAuthRouter,
  applyRouter,
  userRouter,
  logsRouter,
  adminUsersRouter
]; 