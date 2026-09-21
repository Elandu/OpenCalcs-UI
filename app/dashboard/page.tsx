import Link from "next/link";
import { Brand } from "@/components/brand";

export default function DashboardPage() {
  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <Brand />
        <span className="status-pill">Workspace preview</span>
      </header>
      <section className="dashboard-empty">
        <p className="eyebrow">OpenCalcs workspace</p>
        <h1>Your calculations will live here.</h1>
        <p>
          The next build connects the calculation registry, projects, project defaults and saved
          calculation runs.
        </p>
        <Link className="button button-primary" href="/">
          View product direction
        </Link>
      </section>
    </main>
  );
}
