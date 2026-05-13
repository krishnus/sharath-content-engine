import { NextResponse } from 'next/server'

// TEMPORARY DEBUG ROUTE — DELETE AFTER CONFIRMING ENV VARS
// Access at: https://your-app.vercel.app/api/debug-env
export async function GET() {
  return NextResponse.json({
    ANTHROPIC_MODEL:        process.env.ANTHROPIC_MODEL        ?? 'NOT SET',
    ANTHROPIC_API_KEY:      process.env.ANTHROPIC_API_KEY      ? 'SET (hidden)' : 'NOT SET',
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'NOT SET',
    NODE_ENV:               process.env.NODE_ENV               ?? 'NOT SET',
  })
}
