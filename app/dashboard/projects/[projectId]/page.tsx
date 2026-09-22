import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Brand } from "@/components/brand";
import { WindSiteWorkflow } from "@/components/wind-site-workflow";
import { WindWorkflowReview } from "@/components/wind-workflow-review";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;

  if (!userId) {
    redirect("/login");
  }

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select(
      "id, organisation_id, project_number, name, address, status, standards_region, updated_at",
    )
    .eq("id", projectId)
    .maybeSingle();

  if (projectError) {
    throw new Error(`Unable to load project: ${projectError.message}`);
  }

  if (!project) {
    notFound();
  }

  const { data: membership, error: membershipError } = await supabase
    .from("organisation_members")
    .select("role")
    .eq("organisation_id", project.organisation_id)
    .eq("user_id", userId)
    .maybeSingle();

  if (membershipError || !membership) {
    throw new Error(
      membershipError?.message || "Unable to resolve project membership.",
    );
  }

  const { data: calculations, error: calculationError } = await supabase
    .from("calculations")
    .select(
      "id, title, calculation_definition_id, workflow_instance_id, stage_key, state, sort_order, updated_at",
    )
    .eq("project_id", project.id)
    .order("updated_at", { ascending: false });

  if (calculationError) {
    throw new Error(`Unable to load calculations: ${calculationError.message}`);
  }

  const calculationRows = calculations ?? [];
  const calculationIds = calculationRows.map((calculation) => calculation.id);

  const { data: links, error: linkError } = calculationIds.length
    ? await supabase
        .from("calculation_links")
        .select("id, source_calculation_id, target_calculation_id")
        .in("source_calculation_id", calculationIds)
    : { data: [], error: null };

  if (linkError) {
    throw new Error(`Unable to load calculation graph: ${linkError.message}`);
  }

  const workflowIds = calculationRows
    .map((calculation) => calculation.workflow_instance_id)
    .filter((value): value is string => Boolean(value));

  const latestWorkflowId = workflowIds[0] ?? null;
  const currentCalculations = latestWorkflowId
    ? calculationRows
        .filter(
          (calculation) =>
            calculation.workflow_instance_id === latestWorkflowId &&
            calculation.stage_key,
        )
        .sort((left, right) => left.sort_order - right.sort_order)
    : [];

  let workflowStages:
    | Array<{
        calculationId: string;
        stageKey:
          | "site"
          | "wind_region"
          | "terrain"
          | "shielding"
          | "topography"
          | "design";
        title: string;
        state: string;
        latestRun: {
          id: string;
          parent_run_id: string | null;
          run_sequence: number;
          created_at: string;
          input_json: Record<string, unknown>;
          result_json: Record<string, unknown>;
          warnings_json: unknown;
          provenance_json: Record<string, unknown>;
          review: {
            status: "pending" | "approved" | "changes_requested";
            review_note: string | null;
            reviewer_id: string | null;
            reviewed_at: string | null;
            submitted_at: string | null;
          } | null;
        };
        latestReview: {
          status: "pending" | "approved" | "changes_requested";
          review_note: string | null;
          reviewer_id: string | null;
          reviewed_at: string | null;
          submitted_at: string | null;
        } | null;
        history: Array<{
          id: string;
          parent_run_id: string | null;
          run_sequence: number;
          created_at: string;
          input_json: Record<string, unknown>;
          result_json: Record<string, unknown>;
          warnings_json: unknown;
          provenance_json: Record<string, unknown>;
          review: {
            status: "pending" | "approved" | "changes_requested";
            review_note: string | null;
            reviewer_id: string | null;
            reviewed_at: string | null;
            submitted_at: string | null;
          } | null;
        }>;
      }>
    | null = null;

  let baseInputs: Record<string, unknown> = {};
  let activeOverrides: Array<{
    id: string;
    variable: string;
    direction: string | null;
    override_value: number;
    reason: string;
    source_reference: string | null;
    is_active: boolean;
    superseded_at: string | null;
    created_at: string;
  }> = [];
  let overrideHistory = [...activeOverrides];
  let reports: Array<{
    id: string;
    title: string | null;
    revision: number;
    issued_at: string;
    report_hash: string | null;
  }> = [];

  if (latestWorkflowId && currentCalculations.length) {
    const currentCalculationIds = currentCalculations.map(
      (calculation) => calculation.id,
    );

    const { data: runs, error: runError } = await supabase
      .from("calculation_runs")
      .select(
        "id, calculation_id, parent_run_id, run_sequence, input_json, result_json, warnings_json, provenance_json, created_at",
      )
      .in("calculation_id", currentCalculationIds)
      .order("run_sequence", { ascending: false });

    if (runError) {
      throw new Error(`Unable to load run history: ${runError.message}`);
    }

    const runRows = runs ?? [];
    const runIds = runRows.map((run) => run.id);

    const { data: reviews, error: reviewError } = runIds.length
      ? await supabase
          .from("calculation_run_reviews")
          .select(
            "run_id, status, review_note, reviewer_id, reviewed_at, submitted_at",
          )
          .in("run_id", runIds)
      : { data: [], error: null };

    if (reviewError) {
      throw new Error(`Unable to load review history: ${reviewError.message}`);
    }

    const reviewByRun = new Map(
      (reviews ?? []).map((review) => [review.run_id, review]),
    );

    const resolvedStages = currentCalculations
      .map((calculation) => {
        const history = runRows
          .filter((run) => run.calculation_id === calculation.id)
          .sort((left, right) => right.run_sequence - left.run_sequence)
          .map((run) => {
            const review = reviewByRun.get(run.id);
            return {
              id: run.id,
              parent_run_id: run.parent_run_id,
              run_sequence: run.run_sequence,
              created_at: run.created_at,
              input_json: record(run.input_json),
              result_json: record(run.result_json),
              warnings_json: run.warnings_json,
              provenance_json: record(run.provenance_json),
              review: review
                ? {
                    status: review.status as
                      | "pending"
                      | "approved"
                      | "changes_requested",
                    review_note: review.review_note,
                    reviewer_id: review.reviewer_id,
                    reviewed_at: review.reviewed_at,
                    submitted_at: review.submitted_at,
                  }
                : null,
            };
          });

        const latestRun = history[0];
        if (!latestRun || !calculation.stage_key) return null;

        return {
          calculationId: calculation.id,
          stageKey: calculation.stage_key as
            | "site"
            | "wind_region"
            | "terrain"
            | "shielding"
            | "topography"
            | "design",
          title: calculation.title,
          state: calculation.state,
          latestRun,
          latestReview: latestRun.review,
          history,
        };
      })
      .filter((stage) => stage !== null);

    workflowStages = resolvedStages;

    const designStage = resolvedStages.find(
      (stage) => stage.stageKey === "design",
    );
    baseInputs = record(designStage?.latestRun.input_json.workflow_inputs);

    const { data: overrideRows, error: overrideError } = await supabase
      .from("calculation_overrides")
      .select(
        "id, variable, direction, override_value, reason, source_reference, is_active, superseded_at, created_at",
      )
      .eq("workflow_instance_id", latestWorkflowId)
      .order("created_at", { ascending: false });

    if (overrideError) {
      throw new Error(`Unable to load override history: ${overrideError.message}`);
    }

    overrideHistory = (overrideRows ?? []).map((override) => ({
      ...override,
      override_value: Number(override.override_value),
    }));
    activeOverrides = overrideHistory.filter((override) => override.is_active);

    const { data: reportRows, error: reportError } = await supabase
      .from("reports")
      .select("id, title, revision, issued_at, report_hash")
      .eq("project_id", project.id)
      .eq("workflow_instance_id", latestWorkflowId)
      .eq("status", "issued")
      .order("revision", { ascending: false });

    if (reportError) {
      throw new Error(`Unable to load issued reports: ${reportError.message}`);
    }

    reports = reportRows ?? [];
  }

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <Brand />
        <Link href="/dashboard">Back to projects</Link>
      </header>

      <section className="dashboard-workspace">
        <div className="dashboard-title-row">
          <div>
            <p className="eyebrow">
              {project.project_number || "Project"} · {project.standards_region}
            </p>
            <h1>{project.name}</h1>
            <p>{project.address || "No site address set"}</p>
          </div>
          <a className="button button-primary" href="#add-calculation">
            New Wind assessment
          </a>
        </div>

        <div className="project-meta-strip">
          <span>Status <b>{project.status}</b></span>
          <span>Calculation nodes <b>{calculationRows.length}</b></span>
          <span>Links <b>{links?.length ?? 0}</b></span>
          <span>Role <b>{membership.role}</b></span>
          <span>Standards region <b>{project.standards_region}</b></span>
        </div>

        {latestWorkflowId && workflowStages?.length === 6 ? (
          <WindWorkflowReview
            projectId={project.id}
            workflowInstanceId={latestWorkflowId}
            role={membership.role}
            stages={workflowStages}
            activeOverrides={activeOverrides}
            overrideHistory={overrideHistory}
            reports={reports}
            baseInputs={baseInputs}
          />
        ) : null}

        <details
          className={latestWorkflowId ? "new-assessment-disclosure" : ""}
          open={!latestWorkflowId}
        >
          {latestWorkflowId ? <summary>Start another Wind assessment</summary> : null}
          <WindSiteWorkflow
            projectId={project.id}
            projectNumber={project.project_number}
            defaultAddress={project.address}
          />
        </details>

        <div className="project-list-card">
          <div className="project-list-header">
            <div>
              <h2>Calculation graph</h2>
              <p>
                Saved calculation nodes linked by their engineering input/output
                dependencies.
              </p>
            </div>
          </div>

          {calculationRows.length ? (
            <div className="project-list">
              {calculationRows
                .slice()
                .sort((left, right) => {
                  const workflowOrder = String(
                    right.workflow_instance_id ?? "",
                  ).localeCompare(String(left.workflow_instance_id ?? ""));
                  return workflowOrder || left.sort_order - right.sort_order;
                })
                .map((calculation) => (
                  <article className="project-row" key={calculation.id}>
                    <div>
                      <small>{calculation.calculation_definition_id}</small>
                      <h3>{calculation.title}</h3>
                      <p>
                        {calculation.stage_key
                          ? `Stage ${calculation.sort_order + 1} · ${calculation.stage_key.replaceAll("_", " ")}`
                          : calculation.calculation_definition_id}
                      </p>
                    </div>
                    <div className="project-row-meta">
                      <span>{calculation.state}</span>
                      <code>
                        {calculation.workflow_instance_id?.slice(0, 8) || "standalone"}
                      </code>
                    </div>
                  </article>
                ))}
            </div>
          ) : (
            <div className="project-list-empty">
              <h3>No calculations yet</h3>
              <p>Start the Wind site assessment to create the first linked workflow.</p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
