import { JarvisApiError } from "./errors.js";

/**
 * Session + CSRF verification seam.
 *
 * Issue #3 supplies the concrete implementation (Argon2id passphrase login,
 * opaque sessions stored as fixed-length digests, CSRF double-submit bound to
 * the session). The gateway depends only on this contract so the two can be
 * tested — and later wired — independently.
 */
export interface SessionVerifier {
  /**
   * Return true when the request carries a valid authenticated session.
   * Implementations must fail closed.
   */
  isAuthenticated(request: Request): Promise<boolean>;
  /**
   * For state-changing requests: verify the CSRF token (double-submit header
   * bound to the session) plus strict Origin/Host validation.
   */
  verifyCsrf(request: Request): Promise<boolean>;
}

/** Minimal verifier used until issue #3's core is wired in. Fails closed. */
export class NoopSessionVerifier implements SessionVerifier {
  async isAuthenticated(): Promise<boolean> {
    return false;
  }
  async verifyCsrf(): Promise<boolean> {
    return false;
  }
}

export async function requireSession(
  verifier: SessionVerifier,
  request: Request,
  requestId: string,
): Promise<void> {
  if (!(await verifier.isAuthenticated(request))) {
    throw new JarvisApiError("unauthorized", { requestId });
  }
}

export async function requireCsrf(
  verifier: SessionVerifier,
  request: Request,
  requestId: string,
): Promise<void> {
  const origin = request.headers.get("origin");
  if (origin !== null) {
    const host = request.headers.get("host");
    let sameOrigin: boolean;
    try {
      sameOrigin = new URL(origin).host === host;
    } catch {
      sameOrigin = false;
    }
    if (!sameOrigin) throw new JarvisApiError("csrf_invalid", { requestId });
  } else {
    // Non-browser or stripped-origin requests to state-changing routes are
    // rejected; CSRF requires Origin/Host agreement.
    throw new JarvisApiError("csrf_invalid", { requestId });
  }
  if (!(await verifier.verifyCsrf(request))) {
    throw new JarvisApiError("csrf_invalid", { requestId });
  }
}
