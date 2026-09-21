import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Brand } from "@/components/brand";
import { CalculationLauncher } from "@/components/calculation-launcher";
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
    .select("id, title, calculation_definition_id, state, updated_at")
    .eq("project_id", project.id)
    .order("sort_order", { ascending: true })
    .order("updated_at", { ascending: false });

  if (calculationError) {
    throw new Error(`Unable to load calculations: ${calculationError.message}`);
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
          <span>Calculations <b>{calculations?.length ?? 0}</b></span>
          <span>Standards region <b>{project.standards_region}</b></span>
        </div>

        <div id="add-calculation">
          <CalculationLauncher projectId={project.id} />
        </div>

        <div className="project-list-card">
          <div className="project-list-header">
            <div>
              <h2>Calculations</h2>
              <p>Saved calculation instances for this project.</p>
            </div>
          </div>

          {calculations?.length ? (
            <div className="project-list">
              {calculations.map((calculation) => (
                <article className="project-row" key={calculation.id}>
                  <div>
                    <small>{calculation.calculation_definition_id}</small>
                    <h3>{calculation.title}</h3>
                    <p>State: {calculation.state}</p>
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
