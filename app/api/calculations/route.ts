import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();

  if (!claimsData?.claims?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiUrl = process.env.OPENCALCS_API_URL || process.env.NEXT_PUBLIC_OPENCALCS_API_URL;
  if (!apiUrl) {
    return NextResponse.json({ error: "OpenCalcs API is not configured." }, { status: 503 });
  }

  const response = await fetch(`${apiUrl.replace(/\/$/, "")}/api/calculations`, {
    cache: "no-store",
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: "Unable to load calculation library." },
      { status: 502 },
    );
  }

  const calculations = await response.json();
  return NextResponse.json(calculations);
}
