import { NextResponse } from "next/server";

import type { Json } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";

type RunRequest = {
  projectId?: string;
  title?: string;
  inputs?: Json;
};

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ calculationId: string }> },
) {
  const { calculationId } = await context.params;
  const body = (await request.json()) as RunRequest;

  if (
    !body.projectId ||
    !body.title?.trim() ||
    !body.inputs ||
    typeof body.inputs !== "object" ||
    Array.isArray(body.inputs)
  ) {
    return NextResponse.json(
      { error: "projectId, title and inputs are required." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();

  if (!claimsData?.claims?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase.functions.invoke(
    "opencalcs-run-calculation",
    {
      body: {
        projectId: body.projectId,
        calculationId,
        title: body.title.trim(),
        inputs: body.inputs,
      },
    },
  );

  if (error || data?.error) {
    return NextResponse.json(
      { error: error?.message || data?.error || "Calculation failed." },
      { status: 422 },
    );
  }

  return NextResponse.json(data);
}
