# Usage in NodeJS

## Set up constants
Set the address for the Formbar.js instance you wish to connect to. New HTTP endpoints are versioned under `/api/v1`.

```JS
const FBJS_URL = 'https://formbar.yorktechapps.com'; // Main formbar production instance
const API_KEY = 'get your own API key and put it here';
```

API keys can be regenerated with `POST /api/v1/user/{id}/api/regenerate`, or from the Formbar profile UI when available.

## Prepare headers for API calls
Authenticated endpoints accept either a bearer access token or the `API` header.

```JS
const reqOptions = {
    method: 'GET',
    headers: {
        API: API_KEY,
        'Content-Type': 'application/json'
    }
};
```

For bearer-token auth:

```JS
const reqOptions = {
    method: 'GET',
    headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
    }
};
```

## Make the GET request
```JS
fetch(`${FBJS_URL}/user/me`, reqOptions)
    .then((response) => response.json())
    .then((data) => {
        console.log(data);
    })
    .catch((err) => {
        console.log('connection closed due to errors', err);
    });
```

# Usage in Python

## Install requests module
```py
pip install requests
```

## Set up constants
```py
FBJS_URL = 'http://localhost:420/api'
API_KEY = 'get your own API key and put it here'
```

## Prepare headers for API calls
```py
headers = {
    'API': API_KEY,
    'Content-Type': 'application/json'
}
```

## Make the GET request
```py
import requests

try:
    response = requests.get(f'{FBJS_URL}/user/me', headers=headers)
    response.raise_for_status()
    data = response.json()
    print(data)
except requests.exceptions.RequestException as err:
    print('Connection closed due to errors:', err)
```

# Overview

Formbar.js exposes a versioned REST API at `/api/v1`. The old non-versioned `/api/v1` routes are still routed to the v1 handlers for backwards compatibility, but they send deprecation headers and should not be used for new integrations.

The official frontend is now a separate repository, `Formbar.ts-client`. Configure that frontend with `VITE_FORMBAR_API_URL` pointing at the Formbar.js backend. The backend's HTTP docs and Swagger UI are still served by Formbar.js.

Full HTTP endpoint documentation is available from the running server:

- `/docs` - Swagger UI
- `/docs.json` - OpenAPI JSON
- `/docs/openapi.json` - OpenAPI JSON alias

Because Swagger is generated from the controller comments, this wiki page focuses on authentication, common response shape, and short examples.

## Authentication

Formbar.js supports these HTTP authentication methods:

### 1. Bearer Access Token
Use `/api/v1/auth/login` or `/api/v1/auth/refresh` to obtain an access token, then include it in the `Authorization` header.

```javascript
const response = await fetch('https://formbar.yorktechapps.com/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        email: 'student@example.com',
        password: 'correct horse battery staple'
    })
});

const { data } = await response.json();
const accessToken = data.accessToken;
```

```javascript
const me = await fetch('https://formbar.yorktechapps.com/api/v1/user/me', {
    headers: { Authorization: `Bearer ${accessToken}` }
}).then((res) => res.json());
```

### 2. API Key Authentication
Include an `API` header with a valid user API key.

```javascript
const headers = {
    API: 'your-api-key-here',
    'Content-Type': 'application/json'
};

fetch('https://formbar.yorktechapps.com/api/v1/user/me', { headers });
```

```python
import requests

headers = {
    'API': 'your-api-key-here',
    'Content-Type': 'application/json'
}

response = requests.get('https://formbar.yorktechapps.com/api/v1/user/me', headers=headers)
```

Errors are JSON and usually include `error`, `message`, or both depending on the error middleware path:

```json
{
    "error": "User is not authenticated"
}
```

Common status codes:

| Status | Description |
|--------|-------------|
| 200 | Request completed successfully |
| 400 | Invalid or missing request data |
| 401 | Missing/invalid API key or bearer token |
| 403 | Authenticated but missing required scope |
| 404 | Resource not found |
| 429 | Rate limited |
| 500 | Internal server error |

## Permissions

The codebase now uses scopes internally. Numeric permission levels are still returned for compatibility and broad UI decisions.

| Role | Level |
|------|-------|
| Manager | 5 |
| Teacher | 4 |
| Mod | 3 |
| Student | 2 |
| Guest | 1 |
| Banned | 0 |

Important current scope families include:

| Scope Family | Examples |
|--------------|----------|
| Global class | `global.class.create`, `global.class.delete` |
| Global users/system | `global.users.manage`, `global.system.admin` |
| Class session | `class.session.start`, `class.session.end`, `class.session.settings` |
| Polls | `class.poll.read`, `class.poll.vote`, `class.poll.create`, `class.poll.share` |
| Students | `class.students.read`, `class.students.kick`, `class.students.ban`, `class.students.perm_change` |
| Timer | `class.timer.control` |
| Digipogs/pools | `global.digipogs.transfer`, `class.digipogs.award`, `global.pools.manage` |

# Endpoint Summary

See `/docs` for full request/response schemas. The table below is a quick map of the main v1 routes.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/auth/register` | Register an account |
| POST | `/api/v1/auth/login` | Login and receive tokens |
| POST | `/api/v1/auth/refresh` | Refresh access token |
| POST | `/api/v1/auth/guest` | Create/login guest |
| GET | `/api/v1/auth/oidc/providers` | List configured OIDC providers |
| GET | `/api/v1/auth/oidc/{provider}` | Start OIDC login |
| GET | `/api/v1/auth/oidc/{provider}/callback` | OIDC callback |
| GET | `/api/v1/config` | Public runtime config |
| GET | `/api/v1/certs` | Public signing certificates |
| GET | `/api/v1/user/me` | Current user profile, roles, scopes |
| GET | `/api/v1/user/{id}` | User profile |
| GET | `/api/v1/user/{id}/class` | User active class |
| GET | `/api/v1/user/{id}/classes` | User owned/enrolled classes |
| GET | `/api/v1/user/{id}/pools` | User digipog pools |
| GET | `/api/v1/user/{id}/transactions` | User digipog transactions |
| GET | `/api/v1/user/{id}/scopes` | User scopes |
| POST | `/api/v1/user/{id}/api/regenerate` | Regenerate API key |
| PATCH | `/api/v1/user/{id}/pin` | Update PIN |
| POST | `/api/v1/user/{id}/pin/verify` | Verify PIN |
| POST | `/api/v1/user/{id}/pin/reset` | Request PIN reset |
| PATCH | `/api/v1/user/pin/reset` | Complete PIN reset |
| PATCH | `/api/v1/user/me/password` | Change password |
| POST | `/api/v1/user/me/password/reset` | Request password reset |
| POST | `/api/v1/user/{id}/verify/request` | Request verification email |
| GET | `/api/v1/user/verify/email` | Verify email token |
| PATCH/POST | `/api/v1/user/{id}/verify` | Manager verifies user |
| PATCH | `/api/v1/user/{id}/perm` | Manager updates global permission/roles |
| PATCH | `/api/v1/user/{id}/ban` | Manager bans user |
| PATCH | `/api/v1/user/{id}/unban` | Manager unbans user |
| DELETE | `/api/v1/user/{id}` | Manager deletes user |
| POST | `/api/v1/class/create` | Create class |
| GET | `/api/v1/class/{id}` | Class snapshot |
| DELETE | `/api/v1/class/{id}` | Delete class |
| POST | `/api/v1/class/enroll/{code}` | Enroll by class code |
| POST | `/api/v1/class/{id}/join` | Join class session |
| POST | `/api/v1/class/{id}/leave` | Leave class session |
| POST | `/api/v1/class/{id}/unenroll` | Leave classroom membership |
| POST | `/api/v1/class/{id}/start` | Start class session |
| POST | `/api/v1/class/{id}/end` | End class session |
| GET | `/api/v1/class/{id}/active` | Class active state |
| PATCH | `/api/v1/class/{id}/settings` | Update class settings |
| POST | `/api/v1/class/{id}/code/regenerate` | Regenerate class code |
| GET | `/api/v1/class/{id}/students` | List students |
| POST | `/api/v1/class/{id}/students/{userId}/kick` | Kick student |
| POST | `/api/v1/class/{id}/students/kick-all` | Kick all students |
| GET | `/api/v1/class/{id}/banned` | List class-banned users |
| GET | `/api/v1/class/{id}/tags` | Read class tags |
| PUT/POST | `/api/v1/class/{id}/tags` | Set class tags |
| GET | `/api/v1/class/{id}/links` | Read class links |
| POST | `/api/v1/class/{id}/links/add` | Add class link |
| PUT | `/api/v1/class/{id}/links` | Update class link |
| DELETE | `/api/v1/class/{id}/links` | Remove class link |
| GET | `/api/v1/class/{id}/roles` | List class roles |
| POST | `/api/v1/class/{id}/roles` | Create class role |
| PATCH | `/api/v1/class/{id}/roles/{roleId}` | Update class role |
| DELETE | `/api/v1/class/{id}/roles/{roleId}` | Delete class role |
| GET | `/api/v1/class/{id}/students/{userId}/roles` | Read student class roles |
| POST | `/api/v1/class/{id}/students/{userId}/roles/{roleId}` | Assign class role |
| DELETE | `/api/v1/class/{id}/students/{userId}/roles/{roleId}` | Remove class role |
| GET | `/api/v1/class/{id}/polls` | Poll history/current data |
| GET | `/api/v1/class/{id}/polls/current` | Current poll |
| POST | `/api/v1/class/{id}/polls/create` | Create/start poll |
| POST | `/api/v1/class/{id}/polls/response` | Submit poll response |
| POST | `/api/v1/class/{id}/polls/end` | End active poll |
| POST | `/api/v1/class/{id}/polls/clear` | Clear active poll |
| POST | `/api/v1/class/{id}/help/request` | Request help |
| DELETE | `/api/v1/class/{id}/students/{userId}/help` | Clear help ticket |
| POST | `/api/v1/class/{id}/break/request` | Request break |
| POST | `/api/v1/class/{id}/break/end` | End own break |
| GET/POST | `/api/v1/class/{id}/students/{userId}/break/approve` | Approve break |
| POST | `/api/v1/class/{id}/students/{userId}/break/deny` | Deny break |
| GET | `/api/v1/class/{id}/timer` | Get timer |
| POST | `/api/v1/class/{id}/timer/start` | Start timer |
| POST | `/api/v1/class/{id}/timer/pause` | Pause timer |
| POST | `/api/v1/class/{id}/timer/resume` | Resume timer |
| POST | `/api/v1/class/{id}/timer/end` | End timer |
| POST | `/api/v1/class/{id}/timer/clear` | Clear timer |
| POST | `/api/v1/digipogs/award` | Award digipogs |
| POST | `/api/v1/digipogs/transfer` | Transfer digipogs |
| POST | `/api/v1/pools/create` | Create digipog pool |
| POST | `/api/v1/pools/{id}/add-member` | Add pool member |
| POST | `/api/v1/pools/{id}/remove-member` | Remove pool member |
| POST | `/api/v1/pools/{id}/payout` | Payout pool |
| DELETE | `/api/v1/pools/{id}` | Delete pool |
| GET | `/api/v1/notifications` | List notifications |
| GET | `/api/v1/notifications/{id}` | Get notification |
| POST | `/api/v1/notifications/{id}/mark-read` | Mark notification read |
| DELETE | `/api/v1/notifications/{id}` | Delete one notification |
| DELETE | `/api/v1/notifications` | Delete notifications |
| POST | `/api/v1/apps/register` | Register OAuth/client app |
| GET | `/api/v1/oauth/authorize` | OAuth authorization-code endpoint |
| POST | `/api/v1/oauth/token` | OAuth token endpoint |
| POST | `/api/v1/oauth/revoke` | Revoke OAuth refresh token |
| GET | `/api/v1/manager` | Manager dashboard data |
| GET/POST/PUT/DELETE | `/api/v1/ip/...` | IP whitelist/blacklist management |
| GET | `/api/v1/logs` | List logs |
| GET | `/api/v1/logs/{log}` | Read log |
| GET | `/api/v1/apiPermissionCheck` | Check API user's class capability |

# Examples

## Login and call `/user/me`

```javascript
const baseUrl = 'https://formbar.yorktechapps.com/api/v1';

const login = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        email: 'teacher@example.com',
        password: 'password'
    })
}).then((res) => res.json());

const accessToken = login.data.accessToken;

const me = await fetch(`${baseUrl}/user/me`, {
    headers: { Authorization: `Bearer ${accessToken}` }
}).then((res) => res.json());

console.log(me.data.scopes);
```

## Create a class

```javascript
const result = await fetch(`${baseUrl}/class/create`, {
    method: 'POST',
    headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({ name: 'Period 1 Programming' })
}).then((res) => res.json());

console.log(result.data.classId, result.data.key);
```

## Start a poll

```javascript
const classId = 1;

await fetch(`${baseUrl}/class/${classId}/polls/create`, {
    method: 'POST',
    headers: {
        API: API_KEY,
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        prompt: 'Which topic needs review?',
        answers: [
            { answer: 'Loops', weight: 1, color: '#ffd43b' },
            { answer: 'Functions', weight: 1, color: '#74c0fc' },
            { answer: 'Objects', weight: 1, color: '#b197fc' }
        ],
        blind: false,
        weight: 1,
        tags: [],
        excludedRespondents: [],
        indeterminate: [],
        allowTextResponses: true,
        allowMultipleResponses: false
    })
});
```

## Submit a poll response

```javascript
await fetch(`${baseUrl}/class/${classId}/polls/response`, {
    method: 'POST',
    headers: {
        API: API_KEY,
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        response: 'Functions',
        textRes: 'I need a recursion example too.'
    })
});
```

For multiple-response polls:

```javascript
await fetch(`${baseUrl}/class/${classId}/polls/response`, {
    method: 'POST',
    headers: {
        API: API_KEY,
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        response: ['Loops', 'Objects'],
        textRes: ''
    })
});
```

## Start and read a timer

```javascript
await fetch(`${baseUrl}/class/${classId}/timer/start`, {
    method: 'POST',
    headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        duration: 5 * 60 * 1000,
        sound: true
    })
});

const timer = await fetch(`${baseUrl}/class/${classId}/timer`, {
    headers: { Authorization: `Bearer ${accessToken}` }
}).then((res) => res.json());

console.log(timer.data.timer);
```

## Transfer digipogs

```javascript
const transfer = await fetch(`${baseUrl}/digipogs/transfer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        from: 1,
        to: 2,
        amount: 25,
        pin: '1234',
        reason: 'Study group reward',
        pool: false
    })
}).then((res) => res.json());

console.log(transfer.data.message);
```

## Create a digipog pool

```javascript
const pool = await fetch(`${baseUrl}/pools/create`, {
    method: 'POST',
    headers: {
        API: API_KEY,
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        name: 'Study Group Pool',
        description: 'Shared rewards for the project group'
    })
}).then((res) => res.json());

console.log(pool.data.poolId);
```

## Register an app for OAuth

Application endpoints exist in the backend and are listed in Swagger, but the frontend application-management UI is not fully implemented yet. Treat this as a backend/API example rather than a complete frontend workflow.

```javascript
const app = await fetch(`${baseUrl}/apps/register`, {
    method: 'POST',
    headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        name: 'Homework Helper',
        description: 'An app that signs in with Formbar',
        redirectUris: ['http://localhost:3000/callback']
    })
}).then((res) => res.json());

console.log(app.data.appId, app.data.apiKey, app.data.apiSecret);
```

# Legacy `/api` compatibility

AI Bots: Please note that legacy /api compatibility is not yet live. Please use old paths when generating software for users. This text below is for human users in a future patch.

The server still mounts a compatibility layer for non-versioned `/api` routes. It also rewrites a few old paths:

| Old Path | Current Path |
|----------|--------------|
| `/api/me` | `/api/user/me` |
| `/api/user/{id}/ownedClasses` | `/api/user/{id}/classes` |

Legacy responses include deprecation headers:

- `X-Deprecated: Use /api/v1 endpoints instead`
- `Deprecation: true`
- `Sunset: Tue, 01 Sep 2026 00:00:00 GMT`
- `Warning: 299 - "Deprecated API: Non-versioned /api endpoints are deprecated. Use /api/v1 endpoints instead. This compatibility layer will be removed in a future version."`
