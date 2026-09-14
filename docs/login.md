# Login

Every page of the site sits behind `/login`, and every API route checks the login too.
Accounts come from a Cognito user pool where **only an admin can create users**: there
is no sign-up, so the only people who can sign in are the ones you add in the console.

- People sign in with their **email address** and a password.
- New users get a **temporary password** by email and choose their own the first time they
  sign in.
- **Forgot password?** on the login page emails a reset code.
- The browser keeps the session for up to 30 days (Cognito's refresh token), renewing the
  1-hour login token as needed. **Sign out** ends it on that device.

## How it fits together

```
browser ──(email + password)──► Cognito user pool ──► ID token (1 h) + refresh token (30 days)
browser ──(Authorization: Bearer <ID token>)──► API Gateway ──JWT authorizer──► Lambdas
```

The site calls Cognito directly from the browser (`app/lib/auth.ts`, no SDK). API Gateway's
built-in **JWT authorizer** rejects any request without a valid token from this user pool,
so the transcript and dashboard APIs can't be used by someone who merely knows their URL.

## AWS setup

Do these in the console with the account the website uses, in **us-east-1** (the region
selector, top right, must say **N. Virginia**).

### 1. Create the user pool

1. **Cognito → User pools → Create user pool.**
2. **Define your application:** application type **Single-page application (SPA)**; name it
   `isa-web`.
3. **Configure options:**
   - Options for sign-in identifiers: **Email** only.
   - Self-registration: leave **Enable self-registration unticked**. This is what stops
     anyone from creating their own account.
   - Required attributes for sign-up: **email** (the default).
4. **Add a return URL:** leave it empty. The site has its own login page and doesn't use
   Cognito's hosted one.
5. **Create user directory.**

### 2. Allow password sign-in on the app client

1. Open the new pool → **Applications → App clients → isa-web → Edit**.
2. **Authentication flows:** tick **ALLOW_USER_PASSWORD_AUTH**. Keep
   **ALLOW_REFRESH_TOKEN_AUTH** ticked. The others can stay as they are.
3. Check the client has **no client secret** (SPA clients don't). The site can't keep one.
4. **Token expiration:** the defaults are fine: ID token 60 minutes, refresh token 30 days.
   Shorten the refresh token (e.g. 7 days) if people should sign in again more often.
5. Leave **Enable token revocation** on, so **Sign out** also invalidates the session
   server-side. **Save changes.**
6. Copy two values and send them to me (neither is secret):
   - the **Client ID** from this page, for `COGNITO_CLIENT_ID` in `app/lib/awsConfig.ts`;
   - the **User pool ID** from the pool's overview page (looks like `us-east-1_AbC123xyz`),
     for the API authorizer in step 5.

### 3. Check account recovery

Pool → **Authentication → Sign-in → Account recovery → Edit:** set it to **Email only**. This
is what sends the "Forgot password?" codes. Cognito's built-in email sender allows about 50
emails a day, which is plenty for a staff team.

The default **password policy** (at least 8 characters with upper case, lower case, a
number and a symbol) is shown to people when they choose a password.

### 4. Add people

Pool → **User management → Users → Create user:**

- **Invitation message:** *Send an email invitation*.
- **Email address:** their email. Tick **Mark email address as verified**. Without it,
  "Forgot password?" can't send them a code.
- **Temporary password:** *Generate a password*.
- **Create user.**

They receive an email with a temporary password. On the site they sign in with it and are
asked to choose their own.

**To remove someone:** Users → select them → **Disable user access** (or **Delete user**).
They can't sign in again; any page they already have open stops working within an hour,
when their current token expires.

**If an invitation expires** (after 7 days): Users → select them → **Reset password**, which
sends a new temporary password.

### 5. Lock the API

Do this **after** the new site is deployed, since the old site doesn't send login tokens and
would stop working.

1. **API Gateway →** the `8scq4w84j2` HTTP API **→ Authorization → Manage authorizers →
   Create:**
   - Authorizer type **JWT**, name `cognito`.
   - Identity source: `$request.header.Authorization`.
   - Issuer URL: `https://cognito-idp.us-east-1.amazonaws.com/<User pool ID>`.
   - Audience: the **Client ID**.
2. **Attach authorizers to routes:** attach `cognito` to **every** route:
   `GET /transcripts`, `GET /transcripts/{studentId}`, `POST /transcripts`,
   `DELETE /transcripts/{studentId}`, `GET /gradescales`, `GET /gradescales/{instituteId}`,
   `POST /gradescales`, `DELETE /gradescales/{instituteId}`, `GET /dashboard`.
3. **CORS → Configure:** add `authorization` to **Access-Control-Allow-Headers** (keep
   `content-type`). The browser now sends that header, and its preflight check fails without
   this. Save.
4. If the `prod` stage doesn't auto-deploy: **Deploy → prod**.
5. Check it: open `https://8scq4w84j2.execute-api.us-east-1.amazonaws.com/prod/dashboard` in a
   browser. It should now answer `{"message":"Unauthorized"}`. The site, once signed in,
   still loads everything.

The `rebuild-dashboard` Lambda isn't behind the API (you run it from the console), so it's
unaffected.

## Order of operations

1. Steps 1–4 above, and send me the Client ID and User pool ID.
2. I put the Client ID in `app/lib/awsConfig.ts`; you run `npm run deploy`.
3. Sign in on the live site with an account from step 4.
4. Step 5, to lock the API. Then check the site still works and the API URL says
   `Unauthorized`.
