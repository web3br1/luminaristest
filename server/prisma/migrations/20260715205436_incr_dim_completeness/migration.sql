-- INCR-DIM-COMPLETENESS (B1, ADR-INCR-DIM-COMPLETENESS): add the per-account mandatory-dimension flag.
-- Plain ADD COLUMN (NOT a table rebuild): SQLite supports adding a NOT NULL column when a DEFAULT is
-- given, so this is zero-data-change (every existing account gets requiresDimension=false) AND it does
-- NOT drop/recreate `accounts` — preserving the FK graph + ON DELETE cascade EVALUATION ORDER that a
-- full table rebuild would perturb (a rebuild made User-delete cascade collide with the RESTRICT FK
-- referential_mappings.accountId → accounts, P2003).
ALTER TABLE "accounts" ADD COLUMN "requiresDimension" BOOLEAN NOT NULL DEFAULT false;
