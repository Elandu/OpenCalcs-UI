import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

type RunRequest = {
  projectId?: string;
  title?: string;
  inputs?: Record<string, unknown>;
};

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ calculationId: string }> },
) {
  const { calculationId } = await context.params;
  const body = (await request.json()) as RunRequest;

  if (!body.projectId || !body.title?.trim() || !body.inputs) {
    return NextResponse.json(
      { error: "projectId, title and inputs are required." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id")
    .eq("id", body.projectId)
    .maybeSingle();

  if (projectError) {
    return NextResponse.json({ error: projectError.message }, { status: 500 });
  }

  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const apiUrl = process.env.OPENCALCS_API_URL || process.env.NEXT_PUBLIC_OPENCALCS_API_URL;
  if (!apiUrl) {
    return NextResponse.json({ error: "OpenCalcs API is not configured." }, { status: 503 });
  }

  const baseUrl = apiUrl.replace(/\/$/, "");
  const [definitionResponse, runResponse] = await Promise.all([
    fetch(`${baseUrl}/api/calculations/${encodeURIComponent(calculationId)}`, {
      cache: "no-store",
    }),
    fetch(`${baseUrl}/api/calculations/${encodeURIComponent(calculationId)}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inputs: body.inputs }),
      cache: "no-store",
    }),
  ]);

  if (!definitionResponse.ok) {
    return NextResponse.json({ error: "Calculation definition was not found." }, { status: 404 });
  }

  if (!runResponse.ok) {
    let detail = "Calculation failed.";
    try {
      const payload = await runResponse.json();
      detail = payload.detail || payload.error || detail;
    } catch {
      // Keep generic message if the backend response is not JSON.
    }
    return NextResponse.json({ error: detail }, { status: 422 });
  }

  const definition = await definitionResponse.json();
  const result = await runResponse.json();

  const { data: calculation, error: calculationError } = await supabase
    .from("calculations")
    .insert({
      project_id: body.projectId,
      calculation_definition_id: calculationId,
      title: body.title.trim(),
      created_by: userId,
    })
    .select("id")
    .single();

  if (calculationError || !calculation) {
    return NextResponse.json(
      { error: calculationError?.message || "Unable to save calculation." },
      { status: 500 },
    );
  }

  const inputHash = createHash("sha256")
    .update(JSON.stringify(body.inputs))
    .digest("hex");

  const { data: run, error: runError } = await supabase
    .from("calculation_runs")
    .insert({
      calculation_id: calculation.id,
      engine_plugin_id: definition.id?.startsWith("au.wind.") ? "au.openwind" : "unknown",
      engine_plugin_version: "0.8.0",
      calculation_definition_id: calculationId,
      calculation_definition_version: definition.version || "1",
      standard_reference_json: definition.standard || null,
      input_json: body.inputs,
      result_json: result,
      warnings_json: [],
      provenance_json: {
        source: "opencalcs-api",
        runtime: baseUrl,
      },
      input_hash: inputHash,
      created_by: userId,
    })
    .select("id, created_at")
    .single();

  if (runError || !run) {
    await supabase.from("calculations").delete().eq("id", calculation.id);
    return NextResponse.json(
      { error: runError?.message || "Unable to save calculation run." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    calculationId: calculation.id,
    runId: run.id,
    createdAt: run.created_at,
    definition,
    result,
  });
}
