import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({
    OPEN_ROUTES: process.env.NEXT_PUBLIC_OPEN_ROUTES || '',
    NODE_ENV: process.env.NODE_ENV,
  })
}