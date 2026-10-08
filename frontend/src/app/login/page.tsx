"use client";
// Mocked sign-in. Clearly labelled as a demo (credentials pre-filled) so the public demo can't be
// mistaken for a real AWS sign-in page. The session itself is real: an HttpOnly cookie set by the API.
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
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { useFollow } from "@/lib/useFollow";

function LoginForm() {
  const router = useRouter();
  const follow = useFollow();
  const queryClient = useQueryClient();
  const params = useSearchParams();
  const [username, setUsername] = useState("demo");
  const [password, setPassword] = useState("route53-demo");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      await api.login(username, password);
      queryClient.clear(); // drop anything cached for a previously signed-in user
      const next = params.get("next");
      // Only allow internal redirects (prevents open-redirects via ?next=https://evil.example).
      router.replace(next && next.startsWith("/route53/") ? next : "/route53/v2/hostedzones");
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
                Sign in
              </Button>
            }
          >
            <Container header={<Header variant="h1" description="Demo console — mocked authentication">Route 53 Console</Header>}>
              <SpaceBetween size="l">
                <Alert type="info">
                  This is a portfolio clone, not affiliated with AWS. Use <b>demo</b> / <b>route53-demo</b>.
                </Alert>
                {error && <Alert type="error">{error}</Alert>}
                <FormField label="Username">
                  <Input value={username} onChange={(e) => setUsername(e.detail.value)} autoFocus autoComplete="username" />
                </FormField>
                <FormField label="Password">
                  <Input type="password" value={password} onChange={(e) => setPassword(e.detail.value)} autoComplete="current-password" />
                </FormField>
              </SpaceBetween>
            </Container>
          </Form>
        </form>
        <Box textAlign="center" padding={{ top: "m" }}>
          New here?{" "}
          <Link href="/signup" onFollow={follow}>
            Create account
          </Link>
        </Box>
        <Box textAlign="center" color="text-body-secondary" fontSize="body-s" padding={{ top: "s" }}>
          Next.js · FastAPI · SQLite
        </Box>
      </div>
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
