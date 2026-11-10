# HTTP API

The complete HTTP API reference, including endpoints, authentication requirements, request and response schemas, and examples, is available from a running Formbar.js server:

- [`/docs`](/docs) - Interactive Swagger UI
- [`/docs.json`](/docs.json) - OpenAPI JSON
- [`/docs/openapi.json`](/docs/openapi.json) - OpenAPI JSON alias

New integrations should use the versioned API base path `/api/v1`. The official frontend is maintained separately in `Formbar.ts-client`; configure it with `VITE_FORMBAR_API_URL` pointing to the Formbar.js backend.

Non-versioned `/api` routes exist for backwards compatibility, but are deprecated. Use `/api/v1` for new integrations.
