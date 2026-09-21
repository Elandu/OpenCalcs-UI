import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { Brand } from "@/components/brand";

export default function LoginPage() {
  return (
    <main className="auth-shell">
      <div className="auth-top">
        <Brand />
        <Link href="/">Back to home</Link>
      </div>
      <section className="auth-card">
        <p className="eyebrow">Welcome back</p>
        <h1>Sign in to OpenCalcs</h1>
        <p>Open your projects, calculations and review history.</p>
        <AuthForm mode="login" />
      </section>
    </main>
  );
}
