import { NextResponse } from "next/server";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const cookieHeader = req.headers.get("cookie") ?? "";

    const backendRes = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/auth/me`,
      {
        method: "GET",
        headers: {
          cookie: cookieHeader,
        },
      }
    );

    const data = await backendRes.json();
    return NextResponse.json(data, { status: backendRes.status });
  } catch (err) {
    console.error("Auth /me failed:", err);
    return NextResponse.json(
      { success: false, message: "Failed to fetch user" },
      { status: 500 }
    );
  }
}