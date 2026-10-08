"use client";
// Mocked sign-in in two steps, laid out like the console sign-in (identifier, then password).
// Deliberately unbranded: a neutral wordmark and a "not affiliated" label, so the public demo can't be
// mistaken for a real AWS sign-in page. The session itself is real: an HttpOnly cookie set by the API.
import { useQueryClient } from "@tanstack/react-query";
import NextLink from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import styles from "@/components/auth.module.css";
import { api, errorMessage } from "@/lib/api";

// Only allow internal redirects (prevents open-redirects via ?next=https://evil.example).
function safeNext(next: string | null): string {
  return next && next.startsWith("/route53/") ? next : "/route53/v2/hostedzones";
}

function LoginForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useSearchParams();
  const [step, setStep] = useState<1 | 2>(1);
  const [username, setUsername] = useState("demo");
  const [password, setPassword] = useState("route53-demo");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setError(null);
    if (step === 1) {
      if (!username.trim()) {
        setError("Enter your email or username.");
        return;
      }
      setStep(2);
      return;
    }
    setLoading(true);
    try {
      await api.login(username.trim(), password);
      queryClient.clear(); // drop anything cached for a previously signed-in user
      router.replace(safeNext(params.get("next")));
    } catch (e) {
      setError(errorMessage(e));
      setLoading(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.wordmark}>Route 53 Console</div>
      <div className={styles.demoLabel}>Demo — not affiliated with AWS</div>

      <form
        className={styles.card}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <h1 className={styles.heading}>Sign in</h1>

        {step === 1 ? (
          <>
            <p className={styles.text}>Sign in to the demo console.</p>
            <p className={styles.hint}>
              Demo account: <b>demo</b> / <b>route53-demo</b> (already filled in).
            </p>
            {error && <p className={styles.alert}>{error}</p>}
            <div className={styles.field}>
              <label className={styles.label} htmlFor="identifier">
                Email or username
              </label>
              <input
                id="identifier"
                className={styles.input}
                value={username}
                placeholder="username@example.com"
                autoComplete="username"
                autoFocus
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <button type="submit" className={styles.primary}>
              Next
            </button>
          </>
        ) : (
          <>
            <button type="button" className={styles.back} onClick={() => { setStep(1); setError(null); }}>
              ← Back
            </button>
            <p className={styles.identity}>
              Signing in as <b>{username.trim()}</b>
            </p>
            {error && <p className={styles.alert}>{error}</p>}
            <div className={styles.field}>
              <label className={styles.label} htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                className={styles.input}
                value={password}
                autoComplete="current-password"
                autoFocus
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <button type="submit" className={styles.primary} disabled={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </>
        )}

        <div className={styles.divider}>OR</div>
        <NextLink href="/signup" className={styles.secondary}>
          New here? Create account
        </NextLink>
      </form>

      <footer className={styles.footer}>
        <p>
          This is a demo clone built for an assignment. Accounts and DNS data are mocked and stored only in this demo.{" "}
          <a href="https://github.com/chadhap2004-code/route53" target="_blank" rel="noopener noreferrer">
            View the source
          </a>
          .
        </p>
      </footer>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
