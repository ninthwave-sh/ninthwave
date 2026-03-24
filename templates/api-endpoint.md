# API Endpoint

Common pattern for adding a new REST or RPC endpoint to a backend service.

## Keywords

api, endpoint, route, controller, REST, handler, request, response, CRUD, resource

## Typical Breakdown

| # | Item | Description | Suggested LOC |
|---|------|-------------|---------------|
| 1 | Schema/Migration | Database migration for any new or altered tables | 50–150 |
| 2 | Context/Service | Business logic functions (queries, validations, transformations) | 150–300 |
| 3 | Controller/Route | HTTP handler, request parsing, response formatting | 100–200 |
| 4 | Tests | Unit tests for context + controller integration tests | 150–300 |
| 5 | Docs/OpenAPI | API documentation, schema updates | 50–100 |

## Dependencies

```
1 (Schema/Migration)
└── 2 (Context/Service)
    └── 3 (Controller/Route)
        └── 5 (Docs/OpenAPI)
4 (Tests) depends on 2 + 3
```

**Batch 1:** Schema/Migration
**Batch 2:** Context/Service
**Batch 3:** Controller/Route, Tests (parallel — different files)
**Batch 4:** Docs/OpenAPI

## Guidance

- Start with the migration so downstream items can reference real schema.
- Context functions should be independent of the transport layer (no HTTP concerns).
- Controller tests can use integration-style tests that hit the endpoint directly.
- If the endpoint requires authentication or authorization, include middleware/plug setup in the controller item.
- If the endpoint touches an external service, add a dedicated service integration item between Context and Controller.
