import { createApp } from './app.js'
import { D1Database as D1Adapter, R2FileStore } from './storage/cloudflare.js'
import { getConfig } from './config.js'

interface Env {
  DB: D1Database
  BUCKET: R2Bucket
  MAX_FILE_SIZE?: string
  MAX_TEXT_LENGTH?: string
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const config = getConfig({
      MAX_FILE_SIZE: env.MAX_FILE_SIZE,
      MAX_TEXT_LENGTH: env.MAX_TEXT_LENGTH,
    })

    const db = new D1Adapter(env.DB as any)
    const fileStore = new R2FileStore(env.BUCKET)

    // Initialize DB on first request (creates table if not exists)
    await db.initialize()

    const app = createApp(db, fileStore, config)
    return app.fetch(request, env, ctx)
  },
}
