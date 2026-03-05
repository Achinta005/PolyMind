import { NextResponse } from "next/server";
import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
    const body = await req.json();

    const backendRes = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/auth/login`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        }
    );

    const data = await backendRes.json();

    const response = NextResponse.json(data, {
        status: backendRes.status,
    });

    // 🔥 Forward Set-Cookie from backend → Browser
    const setCookie = backendRes.headers.get("set-cookie");
    if (setCookie) {
        response.headers.set("set-cookie", setCookie);
    }

    return response;
}