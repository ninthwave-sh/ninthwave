# Database Migration

Common pattern for schema changes — new tables, columns, indexes, or data migrations.

## Keywords

migration, schema, database, table, column, index, alter, create table, foreign key, seed, backfill, SQL, Ecto, ActiveRecord, Prisma, Knex

## Typical Breakdown

| # | Item | Description | Suggested LOC |
|---|------|-------------|---------------|
| 1 | Migration File | DDL changes — CREATE TABLE, ALTER TABLE, indexes, constraints | 30–100 |
| 2 | Schema/Model Update | ORM schema, type definitions, associations | 50–150 |
| 3 | Data Backfill | One-time data migration for existing records (if needed) | 50–200 |
| 4 | Context/Query Updates | Update queries and business logic for the new schema | 100–250 |
| 5 | Tests | Migration rollback test, schema validation, query tests | 100–200 |

## Dependencies

```
1 (Migration File)
└── 2 (Schema/Model Update)
    ├── 3 (Data Backfill)
    └── 4 (Context/Query Updates)
5 (Tests) depends on 1 + 2
```

**Batch 1:** Migration File
**Batch 2:** Schema/Model Update
**Batch 3:** Data Backfill, Context/Query Updates, Tests (parallel)

## Guidance

- Migration must be reversible (include rollback/down logic).
- Keep DDL and data changes in separate migration files — DDL runs in a transaction, large data backfills may not.
- If the migration is additive (new nullable column, new table), it can be deployed before the code that uses it. This enables zero-downtime deploys.
- For destructive changes (drop column, rename), use a multi-phase approach: add new → migrate data → update code → remove old.
- Data backfill items should be idempotent — safe to re-run if interrupted.
