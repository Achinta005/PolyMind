import { NextResponse, NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const backendRes = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/auth/refresh`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: req.headers.get("cookie") ?? "",
        },
      }
    );

    const data = await backendRes.json();

    const response = NextResponse.json(data, {
      status: backendRes.status,
    });

    // 🔥 Forward Set-Cookie from backend → browser
    const setCookieHeader = backendRes.headers.get("set-cookie");
    if (setCookieHeader) {
      response.headers.set("set-cookie", setCookieHeader);
    }

    return response;
  } catch (err) {
    console.error("Auth refresh failed:", err);
    return NextResponse.json(
      { success: false, message: "Auth refresh failed" },
      { status: 500 }
    );
  }
}