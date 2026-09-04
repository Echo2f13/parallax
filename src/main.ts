import './db/migrate.js'
import { app } from './api/server.js'
import { config } from './config/config.js'
import { registerAllTools } from './tools/index.js'

registerAllTools()
app.listen(config.port, () => {
  console.log(`[Parallax] Server running on port ${config.port}`)
})