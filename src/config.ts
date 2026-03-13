export const getConfig = (env?: Record<string, string>) => ({
  MAX_FILE_SIZE: parseInt(env?.MAX_FILE_SIZE || process.env.MAX_FILE_SIZE || '26214400', 10),
  MAX_TEXT_LENGTH: parseInt(env?.MAX_TEXT_LENGTH || process.env.MAX_TEXT_LENGTH || '10000', 10),
  PORT: parseInt(env?.PORT || process.env.PORT || '3000', 10),
  DATA_DIR: env?.DATA_DIR || process.env.DATA_DIR || './data',
  AUTH_PASSWORD: env?.AUTH_PASSWORD || process.env.AUTH_PASSWORD || '',
})

export type AppConfig = ReturnType<typeof getConfig>
