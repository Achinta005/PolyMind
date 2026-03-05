import { NextResponse, NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  const backendRes = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/auth/logout`,
    {
      method: "POST",
      headers: {
        cookie: req.headers.get("cookie") ?? "",
        authorization: req.headers.get("authorization") ?? "",
      },
    }
  );

  const response = NextResponse.json(
    { success: true },
    { status: backendRes.status }
  );

  // 🔥 Forward cookie clear from backend → browser
  const setCookie = backendRes.headers.get("set-cookie");
  if (setCookie) {
    response.headers.set("set-cookie", setCookie);
  }

  return response;
}