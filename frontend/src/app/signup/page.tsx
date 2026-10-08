"use client";
// Mocked sign-up in two steps, laid out like the console sign-up page: email and account name first,
// then a password. Deliberately unbranded (neutral wordmark, no AWS logo or wording). The new account starts
// with no hosted zones and is signed in straight away (same HttpOnly session cookie).
import { useQueryClient } from "@tanstack/react-query";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useNotifications } from "@/components/Notifications";
import styles from "@/components/auth.module.css";
import { api, ApiError, errorMessage } from "@/lib/api";

// Same rules as SignupIn in backend/app/schemas.py; the server checks them again.
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function emailError(email: string) {
  return EMAIL_RE.test(email.trim()) ? "" : "Enter a valid email address, such as name@example.com.";
}
function accountNameError(name: string) {
  if (!name.trim()) return "Enter an account name.";
  return name.trim().length > 50 ? "Use 50 characters or fewer." : "";
}
function passwordError(password: string) {
  if (password.length < 8) return "Use at least 8 characters.";
  return /[A-Za-z]/.test(password) && /\d/.test(password) ? "" : "Use at least one letter and one number.";
}

// Line-drawn cubes for the bottom corners, like the console sign-up page.
function Cubes({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 260 260" aria-hidden="true">
      <g fill="none" stroke="#b4c6f5" strokeWidth="2">
        <path d="M90 120 L170 80 L250 120 L250 210 L170 250 L90 210 Z M90 120 L170 160 L250 120 M170 160 L170 250" />
        <path d="M0 170 L60 140 L120 170 L120 240 L60 270 L0 240 Z M0 170 L60 200 L120 170 M60 200 L60 270" />
      </g>
    </svg>
  );
}

export default function SignupPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { notify } = useNotifications();
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState("");
  const [accountName, setAccountName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [emailServerError, setEmailServerError] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const errors = {
    email: emailServerError || emailError(email),
    accountName: accountNameError(accountName),
    password: passwordError(password),
    confirm: confirm === password ? "" : "Passwords don't match.",
  };

  async function submit() {
    setShowErrors(true);
    setError(null);
    if (step === 1) {
      if (errors.email || errors.accountName) return;
      setShowErrors(false);
      setStep(2);
      return;
    }
    if (errors.password || errors.confirm) return;
    setLoading(true);
    try {
      const user = await api.signup(email.trim(), accountName.trim(), password);
      queryClient.clear(); // drop anything cached for a previously signed-in user
      notify({ type: "success", content: `Account ${user.account_name} was created. Create your first hosted zone to get started.` });
      router.replace("/route53/v2/hostedzones");
    } catch (e) {
      setLoading(false);
      if (e instanceof ApiError && e.code === "EmailTaken") {
        // The email is on step 1, so send the user back there with the message under the field.
        setEmailServerError(e.message);
        setStep(1);
        setShowErrors(true);
      } else {
        setError(errorMessage(e));
      }
    }
  }

  function fieldClass(err: string) {
    return showErrors && err ? `${styles.input} ${styles.inputError}` : styles.input;
  }

  return (
    <div className={styles.plainPage}>
      <Cubes className={styles.cornerLeft} />
      <Cubes className={styles.cornerRight} />
      <div className={styles.wordmark}>Route 53 Console</div>

      <form
        className={styles.plainCard}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <h1 className={styles.bigHeading}>Create an account</h1>
        <p className={styles.steps}>Step {step} of 2</p>
        {error && <p className={styles.alert}>{error}</p>}

        {step === 1 ? (
          <>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="email">
                Email address
              </label>
              <p className={styles.description}>You sign in with this email. No email is sent; accounts are mocked.</p>
              <input
                id="email"
                type="email"
                className={fieldClass(errors.email)}
                value={email}
                autoComplete="email"
                autoFocus
                onChange={(e) => {
                  setEmail(e.target.value);
                  setEmailServerError("");
                }}
              />
              {showErrors && errors.email && <p className={styles.fieldError}>{errors.email}</p>}
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="accountName">
                Account name
              </label>
              <p className={styles.description}>Choose a name for your account. It&apos;s shown in the top bar.</p>
              <input
                id="accountName"
                className={fieldClass(errors.accountName)}
                value={accountName}
                maxLength={50}
                onChange={(e) => setAccountName(e.target.value)}
              />
              {showErrors && errors.accountName && <p className={styles.fieldError}>{errors.accountName}</p>}
            </div>
            <button type="submit" className={styles.primary}>
              Continue
            </button>
          </>
        ) : (
          <>
            <button type="button" className={styles.back} onClick={() => { setStep(1); setError(null); }}>
              ← Back
            </button>
            <p className={styles.identity}>
              Creating <b>{accountName.trim()}</b> for <b>{email.trim()}</b>
            </p>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="password">
                Password
              </label>
              <p className={styles.description}>At least 8 characters, with a letter and a number. Don&apos;t reuse a real password.</p>
              <input
                id="password"
                type="password"
                className={fieldClass(errors.password)}
                value={password}
                autoComplete="new-password"
                autoFocus
                onChange={(e) => setPassword(e.target.value)}
              />
              {showErrors && errors.password && <p className={styles.fieldError}>{errors.password}</p>}
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="confirm">
                Confirm password
              </label>
              <input
                id="confirm"
                type="password"
                className={fieldClass(errors.confirm)}
                value={confirm}
                autoComplete="new-password"
                onChange={(e) => setConfirm(e.target.value)}
              />
              {showErrors && errors.confirm && <p className={styles.fieldError}>{errors.confirm}</p>}
            </div>
            <button type="submit" className={styles.primary} disabled={loading}>
              {loading ? "Creating account…" : "Create account"}
            </button>
          </>
        )}

        <div className={styles.divider}>OR</div>
        <NextLink href="/login" className={styles.secondary}>
          Sign in to an existing account
        </NextLink>
        <p className={styles.footer}>This demo uses one essential cookie to keep you signed in.</p>
      </form>

      <footer className={styles.footer}>
        <p>
          Built for an assignment.{" "}
          <a href="https://github.com/chadhap2004-code/route53" target="_blank" rel="noopener noreferrer">
            View the source
          </a>
        </p>
      </footer>
    </div>
  );
}
