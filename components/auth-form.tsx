"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Mode = "login" | "signup";

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const isSignup = mode === "signup";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (
      !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    ) {
      setMessage(
        "Supabase is not connected yet. Add the project URL and publishable key to .env.local.",
      );
      return;
    }

    setBusy(true);
    const supabase = createClient();

    const result = isSignup
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });

    setBusy(false);

    if (result.error) {
      setMessage(result.error.message);
      return;
    }

    if (isSignup && !result.data.session) {
      setMessage("Check your email to confirm your account.");
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <label>
        Work email
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          placeholder="you@engineering.com.au"
          required
        />
      </label>
      <label>
        Password
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete={isSignup ? "new-password" : "current-password"}
          minLength={8}
          required
        />
      </label>
      <button className="button button-primary auth-submit" type="submit" disabled={busy}>
        {busy ? "Working…" : isSignup ? "Create workspace" : "Sign in"}
      </button>
      {message ? <p className="form-message">{message}</p> : null}
      <p className="auth-switch">
        {isSignup ? "Already have an account?" : "New to OpenCalcs?"}{" "}
        <Link href={isSignup ? "/login" : "/signup"}>
          {isSignup ? "Sign in" : "Create an account"}
        </Link>
      </p>
    </form>
  );
}
