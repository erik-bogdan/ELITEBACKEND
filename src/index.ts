import { app } from './app'

app.listen(process.env.BACKEND_PORT || 3000)

console.log(
  ` 🍺 ELITE Beerpong is running at ${app.server?.hostname}:${app.server?.port}`
)