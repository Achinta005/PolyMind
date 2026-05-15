// app/api/auth/oauth/[provider]/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  req: NextRequest,
  { params }: { params: { provider: string } },
) {
  const { provider } = await params; // Next 15 — params is a Promise

  const allowed = ['google', 'github'];

  if (!allowed.includes(provider)) {
    return NextResponse.json({ error: 'Invalid provider' }, { status: 400 });
  }

  // Use server-only env var (no NEXT_PUBLIC_ prefix) for server-side Route Handlers
  const apiUrl = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL;

  if (!apiUrl) {
    console.error('API_URL is not set');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const target = `${apiUrl}/polymind/auth/${provider}`;
  console.log(`OAuth redirect → ${target}`); // confirm this appears in terminal

  return NextResponse.redirect(target);
}