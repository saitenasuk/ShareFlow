// env: from wrangler.toml [vars] / secrets (Worker), or .env file (local via --env-file)
// Fallback to defaults when neither is provided
export const getConfig = (env?: Record<string, string | undefined>) => ({
  MAX_FILE_SIZE: parseInt(env?.MAX_FILE_SIZE || '26214400', 10),
  MAX_TEXT_LENGTH: parseInt(env?.MAX_TEXT_LENGTH || '100000', 10),
  PORT: parseInt(env?.PORT || '3000', 10),
  DATA_DIR: env?.DATA_DIR || './data',
  AUTH_PASSWORD: env?.AUTH_PASSWORD || '',
})

export type AppConfig = ReturnType<typeof getConfig>
