import { NextResponse, NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json();

  const backendRes = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/auth/oauth/callback`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );

  const data = await backendRes.json();
  const response = NextResponse.json(data, { status: backendRes.status });

  // Forward httpOnly refresh_token cookie from main server → browser
  const setCookie = backendRes.headers.get("set-cookie");
  if (setCookie) {
    response.headers.set("set-cookie", setCookie);
  }

  return response;
}
