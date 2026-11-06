# Uses
Formbar allows third-party applications to use Formbar accounts for login.

Formbar is now split into two repositories:

- **Formbar.js**: backend/API/socket server.
- **Formbar.ts-client**: official frontend web app.

The frontend currently supports the original third-party redirect flow at `/oauth?redirectURL=...`. The newer backend OAuth authorization-code endpoints exist under `/api/v1/oauth/...`, but the frontend does not use them for third-party app authorization yet. Because application management is not fully implemented in the frontend yet, this page documents the working frontend flow first and gives only a minimal future-flow outline for the backend endpoints.

## Configuration

Backend `.env`:

```env
FRONTEND_URL=http://localhost:5173
```

Frontend `.env` in the `Formbar.ts-client` repo:

```env
VITE_FORMBAR_API_URL=http://localhost:420
VITE_FORMBAR_CLIENT_URL=http://localhost:5173
```

`VITE_FORMBAR_API_URL` points the frontend at the Formbar.js backend. `VITE_FORMBAR_CLIENT_URL` is the public URL of the frontend.

<details open>
<summary>Current frontend-supported flow: legacy redirect token</summary>

## Current Flow

Use this for third-party apps today.

1. Your app redirects the browser to the Formbar frontend:

   ```text
   {FORMBAR_CLIENT_URL}/oauth?redirectURL={YOUR_CALLBACK_URL}
   ```

2. The user logs in on Formbar.ts-client.
3. The frontend redirects back to your callback with a `token` query parameter:

   ```text
   {YOUR_CALLBACK_URL}?token={JWT}
   ```

4. Your app stores that token in its own session and can call Formbar with:

   ```http
   Authorization: Bearer {JWT}
   ```

On the `/oauth` route, the frontend uses the legacy token when available so older apps that inspect `permissions` continue to work.

## Minimal NodeJS Example

```bash
npm i express express-session
```

```JS
const express = require('express');
const session = require('express-session');

const app = express();

const FORMBAR_API_URL = 'http://localhost:420';
const FORMBAR_CLIENT_URL = 'http://localhost:5173';
const THIS_APP_URL = 'http://localhost:3000';

app.use(session({
    secret: process.env.SESSION_SECRET || 'replace-this-secret',
    resave: false,
    saveUninitialized: false
}));

function requireFormbarLogin(req, res, next) {
    if (req.session.formbarToken) return next();

    const callbackUrl = `${THIS_APP_URL}/login/callback`;
    const loginUrl = new URL('/oauth', FORMBAR_CLIENT_URL);
    loginUrl.searchParams.set('redirectURL', callbackUrl);
    return res.redirect(loginUrl.toString());
}

app.get('/', requireFormbarLogin, async (req, res, next) => {
    try {
        const me = await fetch(`${FORMBAR_API_URL}/api/v1/user/me`, {
            headers: {
                Authorization: `Bearer ${req.session.formbarToken}`
            }
        }).then((response) => response.json());

        res.json(me.data);
    } catch (error) {
        next(error);
    }
});

app.get('/login/callback', (req, res) => {
    if (!req.query.token) {
        return res.status(400).send('Missing Formbar token');
    }

    req.session.formbarToken = req.query.token;
    res.redirect('/');
});

app.listen(3000);
```

## Guest Login

If the user chooses guest login during the current flow, Formbar.ts-client also redirects back with a `token`. Guest tokens are short-lived access tokens and do not have a refresh token.

## Notes

- Always validate or use the returned token server-side. The simplest validation is to call `/api/v1/user/me` with the bearer token.
- For a socket connection, pass the returned token in the `authorization` connection header.
- Do not put sensitive app state only in the `redirectURL`; keep your own server-side session state if needed.

</details>

<details>
<summary>Future backend OAuth flow: authorization code endpoints</summary>

## Future Flow

The backend has OAuth-style authorization-code endpoints:

- `GET /api/v1/oauth/authorize`
- `POST /api/v1/oauth/token`
- `POST /api/v1/oauth/revoke`

The normal frontend app does not yet use these endpoints for third-party application authorization, so third-party integrations should continue using the current `/oauth?redirectURL=...` frontend flow above.

When the frontend flow is completed in a future version, the expected shape is:

1. Your app sends the user to a Formbar frontend authorization page.
2. The user logs in on Formbar.ts-client if needed.
3. The frontend/server redirects back to your app with `code` and `state`.
4. Your backend exchanges the code with `/api/v1/oauth/token`.
5. Your backend stores the returned access and refresh tokens in your own session.

Minimal callback exchange shape:

```JS
async function exchangeCodeForTokens({ code, stateFromCallback, stateFromSession }) {
    if (stateFromCallback !== stateFromSession) {
        throw new Error('Invalid OAuth state');
    }

    const response = await fetch('http://localhost:420/api/v1/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            grant_type: 'authorization_code',
            code,
            redirect_uri: 'http://localhost:3000/login/callback',
            client_id: process.env.FORMBAR_CLIENT_ID,
            client_secret: process.env.FORMBAR_CLIENT_SECRET
        })
    });

    const result = await response.json();
    return result.data;
}
```

Refreshing tokens:

```JS
async function refreshTokens(refreshToken) {
    const response = await fetch('http://localhost:420/api/v1/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            grant_type: 'refresh_token',
            refresh_token: refreshToken
        })
    });

    const result = await response.json();
    return result.data;
}
```

Revoking a refresh token:

```JS
await fetch('http://localhost:420/api/v1/oauth/revoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        token: refreshToken,
        token_type_hint: 'refresh_token'
    })
});
```

These backend endpoints remain documented in the [HTTP API](HTTP-API) page and in Swagger at `/docs`.

</details>

## Verifying Tokens

Formbar signs JWTs with RS256. Public certificate data is available from:

```text
GET /api/v1/certs
```

Most integrations can simply call:

```text
GET /api/v1/user/me
Authorization: Bearer <token>
```
