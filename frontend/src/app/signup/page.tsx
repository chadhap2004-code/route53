"use client";
// Mocked sign-up, in the same style as the sign-in page. A new account gets its own copy of the demo
// hosted zones, and the API signs it in straight away (same HttpOnly session cookie as login).
import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import Form from "@cloudscape-design/components/form";
import FormField from "@cloudscape-design/components/form-field";
import Header from "@cloudscape-design/components/header";
import Input from "@cloudscape-design/components/input";
import Link from "@cloudscape-design/components/link";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useNotifications } from "@/components/Notifications";
import { api, errorMessage } from "@/lib/api";
import { useFollow } from "@/lib/useFollow";

// Same rules as the API (SignupIn in backend/app/schemas.py); the server checks them again.
const USERNAME_RE = /^[a-z0-9_-]{3,32}$/;

export default function SignupPage() {
  const router = useRouter();
  const follow = useFollow();
  const { notify } = useNotifications();
  const queryClient = useQueryClient();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const usernameError = !USERNAME_RE.test(username)
    ? "Use 3 to 32 characters: lowercase letters, numbers, hyphens (-) and underscores (_)."
    : "";
  const passwordError = password.length < 8 ? "Use at least 8 characters." : "";
  const confirmError = confirm !== password ? "Passwords don't match." : "";

  async function submit() {
    setSubmitted(true);
    if (usernameError || passwordError || confirmError) return;
    setLoading(true);
    setError(null);
    try {
      const user = await api.signup(username, password);
      queryClient.clear(); // drop anything cached for a previously signed-in user
      notify({ type: "success", content: `Account ${user.username} was created. The demo hosted zones were added to it.` });
      router.replace("/route53/v2/hostedzones");
    } catch (e) {
      setError(errorMessage(e));
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Form
            actions={
              <Button variant="primary" formAction="submit" loading={loading} fullWidth>
                Create account
              </Button>
            }
          >
            <Container header={<Header variant="h1" description="Demo console — mocked accounts">Create account</Header>}>
              <SpaceBetween size="l">
                <Alert type="info">
                  This is a portfolio clone, not affiliated with AWS. Accounts exist only in this demo, so don&apos;t
                  reuse a real password.
                </Alert>
                {error && <Alert type="error">{error}</Alert>}
                <FormField
                  label="Username"
                  constraintText="3 to 32 characters: a-z, 0-9, hyphen (-) and underscore (_)."
                  errorText={submitted ? usernameError : undefined}
                >
                  <Input value={username} onChange={(e) => setUsername(e.detail.value)} autoFocus autoComplete="username" />
                </FormField>
                <FormField
                  label="Password"
                  constraintText="At least 8 characters."
                  errorText={submitted ? passwordError : undefined}
                >
                  <Input type="password" value={password} onChange={(e) => setPassword(e.detail.value)} autoComplete="new-password" />
                </FormField>
                <FormField label="Confirm password" errorText={submitted ? confirmError : undefined}>
                  <Input type="password" value={confirm} onChange={(e) => setConfirm(e.detail.value)} autoComplete="new-password" />
                </FormField>
              </SpaceBetween>
            </Container>
          </Form>
        </form>
        <Box textAlign="center" padding={{ top: "m" }}>
          Already have an account?{" "}
          <Link href="/login" onFollow={follow}>
            Sign in
          </Link>
        </Box>
      </div>
    </div>
  );
}
