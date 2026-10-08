// Runs on the edge before console pages and the sign-in/sign-up pages.
//   console page without a session cookie  -> /login
//   /login or /signup with a session cookie -> the console
// This is only a fast UX guard; the backend still validates the session on every API call, and it
// deletes the cookie when it answers 401, so an expired cookie can't cause a redirect loop here.
import { NextResponse, type NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const signedIn = !!req.cookies.get("r53_session");
  const { pathname } = req.nextUrl;
  if (pathname === "/login" || pathname === "/signup") {
    if (!signedIn) return NextResponse.next();
    const next = req.nextUrl.searchParams.get("next");
    const url = req.nextUrl.clone();
    url.pathname = next && next.startsWith("/route53/") ? next : "/route53/v2/hostedzones";
    url.search = "";
    return NextResponse.redirect(url);
  }
  if (!signedIn) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/route53/:path*", "/login", "/signup"] };
