import { NextResponse, type NextRequest } from "next/server";

/**
 * First gate for every request: does the browser even claim a session, and is a
 * state-changing request coming from this origin?
 *
 * This runs on the edge runtime, so it deliberately does not import the session
 * module (which needs the database). It only reads the cookie's presence; the
 * session itself is verified against the database by getSession() inside each
 * route and page, which fails closed on its own. A forged cookie therefore gets
 * past this check and is rejected there.
 */
const SESSION_COOKIE = "oc_session";

const PUBLIC_PATHS = ["/signin", "/site", "/api/public-site/health", "/api/health", "/api/auth/"];
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`) || pathname === path.replace(/\/$/, ""))) {
    return true;
  }
  return pathname.startsWith("/api/auth/");
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Same-origin is checked before anything is treated as public: signing in is a
  // POST too, and it must not be possible to drive it from another site.
  if (MUTATING.has(request.method)) {
    const origin = request.headers.get("origin");
    if (origin) {
      const host = request.headers.get("host");
      let originHost = "";
      try {
        originHost = new URL(origin).host;
      } catch {
        originHost = "";
      }
      if (!originHost || originHost !== host) {
        return NextResponse.json(
          { ok: false, error: "Cross-origin request refused." },
          { status: 403 },
        );
      }
    }
  }

  if (isPublic(pathname)) {
    // A signed-in visitor has no business on the sign-in form.
    if (pathname === "/signin" && request.cookies.get(SESSION_COOKIE)?.value) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      url.search = "";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  if (request.cookies.get(SESSION_COOKIE)?.value) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ ok: false, error: "Sign in to continue." }, { status: 401 });
  }

  const url = request.nextUrl.clone();
  url.pathname = "/signin";
  url.search = "";
  if (pathname !== "/") url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
