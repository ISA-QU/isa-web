/**
 * Sign-in against the Cognito user pool, called straight from the browser.
 *
 * Accounts are created by an admin in the AWS console; self sign-up is off, so
 * this module only ever signs in, never registers. It talks to Cognito's public
 * JSON API with fetch rather than pulling in an SDK, using the
 * USER_PASSWORD_AUTH flow, which the app client must allow.
 *
 * The session lives in localStorage. Every API call sends the ID token as a
 * Bearer token, which API Gateway's JWT authorizer checks.
 */

import { BASE_PATH } from "./basePath";
import { COGNITO_CLIENT_ID, COGNITO_REGION } from "./awsConfig";

const ENDPOINT = `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/`;
const STORAGE_KEY = "isa-web.session";
/** Fired in this tab when the stored session changes; other tabs get the `storage` event. */
const SESSION_EVENT = "isa-web:session";
/** Refresh this long before the ID token expires, so no request carries a token about to lapse. */
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

export interface Session {
  email: string;
  idToken: string;
  refreshToken: string;
  /** Epoch milliseconds when `idToken` expires. */
  expiresAt: number;
}

export class AuthError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}

export const isAuthConfigured = COGNITO_CLIENT_ID !== "";

/* ------------------------------------------------------------------ *
 * Cognito API
 * ------------------------------------------------------------------ */

interface AuthenticationResult {
  IdToken: string;
  RefreshToken?: string;
  ExpiresIn: number;
}

interface InitiateAuthResponse {
  AuthenticationResult?: AuthenticationResult;
  ChallengeName?: string;
  Session?: string;
}

function friendlyMessage(code: string, message: string | undefined): string {
  switch (code) {
    case "NotAuthorizedException":
      // Also raised for "Password attempts exceeded", which is worth showing verbatim.
      return message?.toLowerCase().includes("attempts exceeded")
        ? "Too many failed attempts. Wait a few minutes and try again."
        : "Incorrect email or password.";
    case "UserNotFoundException":
      return "Incorrect email or password.";
    case "PasswordResetRequiredException":
      return "Your password has to be reset. Use “Forgot password?” to choose a new one.";
    case "InvalidPasswordException":
      return message ?? "That password doesn't meet the requirements.";
    case "CodeMismatchException":
      return "That code is incorrect.";
    case "ExpiredCodeException":
      return "That code has expired. Request a new one.";
    case "LimitExceededException":
    case "TooManyRequestsException":
      return "Too many attempts. Wait a few minutes and try again.";
    case "InvalidParameterException":
      return message ?? "Check what you entered and try again.";
    default:
      return message ?? "Something went wrong. Try again.";
  }
}

async function cognito<T>(action: string, body: object): Promise<T> {
  if (!isAuthConfigured) {
    throw new AuthError("Sign-in isn't configured yet: COGNITO_CLIENT_ID is empty.", "NotConfigured");
  }
  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-amz-json-1.1",
        "X-Amz-Target": `AWSCognitoIdentityProviderService.${action}`,
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new AuthError("Couldn't reach the sign-in service. Check your connection.", "NetworkError");
  }
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const code = String(data.__type ?? "UnknownError").split("#").pop() ?? "UnknownError";
    throw new AuthError(friendlyMessage(code, data.message as string | undefined), code);
  }
  return data as T;
}

/* ------------------------------------------------------------------ *
 * Session storage
 * ------------------------------------------------------------------ */

function decodeClaims(token: string): Record<string, unknown> {
  const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
  const padded = part.padEnd(Math.ceil(part.length / 4) * 4, "=");
  const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

function saveSession(result: AuthenticationResult, previousRefreshToken?: string): Session {
  const refreshToken = result.RefreshToken ?? previousRefreshToken;
  if (!refreshToken) throw new AuthError("Sign-in returned no refresh token.", "UnknownError");
  const session: Session = {
    email: String(decodeClaims(result.IdToken).email ?? ""),
    idToken: result.IdToken,
    refreshToken,
    expiresAt: Date.now() + result.ExpiresIn * 1000,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Storage blocked (private mode, policy): the session lasts for this page only.
  }
  window.dispatchEvent(new Event(SESSION_EVENT));
  return session;
}

function clearSession() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing stored.
  }
  window.dispatchEvent(new Event(SESSION_EVENT));
}

/** Calls `onChange` when the session is saved or cleared, in this tab or another. */
export function subscribeToSession(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(SESSION_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(SESSION_EVENT, onChange);
  };
}

/** The stored session as its raw string: unchanged between writes, as useSyncExternalStore requires. */
export function sessionSnapshot(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** The stored session, if any. Its ID token may be expired; `getIdToken` refreshes it. */
export function getSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * Sign-in flows
 * ------------------------------------------------------------------ */

export type SignInResult =
  | { status: "signedIn" }
  /** First sign-in with the temporary password: the user must choose their own. */
  | { status: "newPasswordRequired"; challengeSession: string };

export async function signIn(email: string, password: string): Promise<SignInResult> {
  const response = await cognito<InitiateAuthResponse>("InitiateAuth", {
    AuthFlow: "USER_PASSWORD_AUTH",
    ClientId: COGNITO_CLIENT_ID,
    AuthParameters: { USERNAME: email, PASSWORD: password },
  });
  if (response.ChallengeName === "NEW_PASSWORD_REQUIRED" && response.Session) {
    return { status: "newPasswordRequired", challengeSession: response.Session };
  }
  if (!response.AuthenticationResult) {
    throw new AuthError(`Unsupported sign-in step: ${response.ChallengeName ?? "none"}.`, "UnknownError");
  }
  saveSession(response.AuthenticationResult);
  return { status: "signedIn" };
}

export async function completeNewPassword(
  email: string,
  newPassword: string,
  challengeSession: string,
): Promise<void> {
  const response = await cognito<InitiateAuthResponse>("RespondToAuthChallenge", {
    ChallengeName: "NEW_PASSWORD_REQUIRED",
    ClientId: COGNITO_CLIENT_ID,
    Session: challengeSession,
    ChallengeResponses: { USERNAME: email, NEW_PASSWORD: newPassword },
  });
  if (!response.AuthenticationResult) {
    throw new AuthError("Couldn't finish setting your password. Sign in again.", "UnknownError");
  }
  saveSession(response.AuthenticationResult);
}

/** Emails a reset code. Cognito answers the same way for unknown emails, so this reveals nothing. */
export async function forgotPassword(email: string): Promise<void> {
  await cognito("ForgotPassword", { ClientId: COGNITO_CLIENT_ID, Username: email });
}

export async function confirmForgotPassword(
  email: string,
  code: string,
  newPassword: string,
): Promise<void> {
  await cognito("ConfirmForgotPassword", {
    ClientId: COGNITO_CLIENT_ID,
    Username: email,
    ConfirmationCode: code,
    Password: newPassword,
  });
}

export function signOut() {
  const session = getSession();
  clearSession();
  if (session) {
    // Invalidate the refresh token server-side too. Best effort: the local session is already gone.
    cognito("RevokeToken", { ClientId: COGNITO_CLIENT_ID, Token: session.refreshToken }).catch(() => {});
  }
}

/* ------------------------------------------------------------------ *
 * Tokens for API calls
 * ------------------------------------------------------------------ */

let refreshing: Promise<Session> | null = null;

async function refresh(session: Session): Promise<Session> {
  const response = await cognito<InitiateAuthResponse>("InitiateAuth", {
    AuthFlow: "REFRESH_TOKEN_AUTH",
    ClientId: COGNITO_CLIENT_ID,
    AuthParameters: { REFRESH_TOKEN: session.refreshToken },
  });
  if (!response.AuthenticationResult) throw new AuthError("Session refresh failed.", "UnknownError");
  return saveSession(response.AuthenticationResult, session.refreshToken);
}

/** Sends the browser to the login page, returning to the current page afterwards. */
export function redirectToLogin() {
  clearSession();
  const here = window.location.pathname.slice(BASE_PATH.length) + window.location.search;
  window.location.replace(`${BASE_PATH}/login/?next=${encodeURIComponent(here)}`);
}

/**
 * A current ID token, refreshed when it is close to expiring. If the session
 * can't be renewed (signed out, refresh token expired or revoked), redirects to
 * the login page.
 */
export async function getIdToken(): Promise<string> {
  const session = getSession();
  if (!session) {
    redirectToLogin();
    throw new AuthError("Not signed in.", "NotSignedIn");
  }
  if (session.expiresAt - Date.now() > REFRESH_MARGIN_MS) return session.idToken;

  // Several requests can start at once; share one refresh between them.
  refreshing ??= refresh(session).finally(() => {
    refreshing = null;
  });
  try {
    return (await refreshing).idToken;
  } catch (error) {
    if (error instanceof AuthError && error.code === "NetworkError") throw error;
    redirectToLogin();
    throw new AuthError("Your session has expired. Sign in again.", "SessionExpired");
  }
}

/** `Authorization` header for calls to the site's API Gateway routes. */
export async function authHeaders(): Promise<Record<string, string>> {
  return { Authorization: `Bearer ${await getIdToken()}` };
}
