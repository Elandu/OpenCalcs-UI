import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { Brand } from "@/components/brand";

export default function SignupPage() {
  return (
    <main className="auth-shell">
      <div className="auth-top">
        <Brand />
        <Link href="/">Back to home</Link>
      </div>
      <section className="auth-card">
        <p className="eyebrow">Early access</p>
        <h1>Create your engineering workspace</h1>
        <p>Start with a private workspace for projects and transparent calculations.</p>
        <AuthForm mode="signup" />
      </section>
    </main>
  );
}
