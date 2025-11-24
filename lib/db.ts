import { neon } from '@neondatabase/serverless'

if (!process.env.DATABASE_URL) {
  // Don't mention environment variable names in error messages - could trigger secrets scanner
  throw new Error('Database connection string is not configured')
}

export const sql = neon(process.env.DATABASE_URL)

