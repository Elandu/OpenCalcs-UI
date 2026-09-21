import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Brand } from "@/components/brand";
import { WindSiteWorkflow } from "@/components/wind-site-workflow";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();

  if (!claimsData?.claims?.sub) {
    redirect("/login");
  }

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, project_number, name, address, status, standards_region, updated_at")
    .eq("id", projectId)
    .maybeSingle();

  if (projectError) {
    throw new Error(`Unable to load project: ${projectError.message}`);
  }

  if (!project) {
    notFound();
  }

  const { data: calculations, error: calculationError } = await supabase
    .from("calculations")
    .select("id, title, calculation_definition_id, state, sort_order, updated_at")
    .eq("project_id", project.id)
    .order("sort_order", { ascending: true })
    .order("updated_at", { ascending: false });

  if (calculationError) {
    throw new Error(`Unable to load calculations: ${calculationError.message}`);
  }

  const calculationIds = (calculations ?? []).map((calculation) => calculation.id);
  const { data: links, error: linkError } = calculationIds.length
    ? await supabase
        .from("calculation_links")
        .select("id, source_calculation_id, target_calculation_id")
        .in("source_calculation_id", calculationIds)
    : { data: [], error: null };

  if (linkError) {
    throw new Error(`Unable to load calculation graph: ${linkError.message}`);
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
            Add calculation
          </a>
        </div>

        <div className="project-meta-strip">
          <span>Status <b>{project.status}</b></span>
          <span>Calculation nodes <b>{calculations?.length ?? 0}</b></span>
          <span>Links <b>{links?.length ?? 0}</b></span>
          <span>Standards region <b>{project.standards_region}</b></span>
        </div>

        <WindSiteWorkflow
          projectId={project.id}
          projectNumber={project.project_number}
          defaultAddress={project.address}
        />

        <div className="project-list-card">
          <div className="project-list-header">
            <div>
              <h2>Calculation graph</h2>
              <p>Saved calculation nodes linked by their engineering input/output dependencies.</p>
            </div>
          </div>

          {calculations?.length ? (
            <div className="project-list">
              {calculations.map((calculation) => (
                <article className="project-row" key={calculation.id}>
                  <div>
                    <small>{calculation.calculation_definition_id}</small>
                    <h3>{calculation.title}</h3>
                    <p>
                      Stage {calculation.sort_order + 1} · {calculation.calculation_definition_id}
                    </p>
                  </div>
                  <div className="project-row-meta">
                    <span>{calculation.state}</span>
                    <span>Open →</span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="project-list-empty">
              <h3>No calculations yet</h3>
              <p>
                OpenWind will be the first calculation module available in this project.
              </p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
