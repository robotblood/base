-- The database's half of the assist money boundary.
--
-- GET /assist/context (the bundle external lanes reason over) drops to this
-- role for its whole transaction. The role can read exactly the four tables
-- that lane is allowed to think about — so a money query that somehow lands
-- in that endpoint errors instead of answering. app/assist.py reports
-- "db_guard: on" once this exists.
--
-- Run once, as postgres:
--   sudo -u postgres psql -d base -f scripts/assist_role.sql

DO $$
BEGIN
	IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'base_assist_cloud') THEN
		CREATE ROLE base_assist_cloud NOLOGIN;
	END IF;
END
$$;

-- The api connects as `base`; membership is what lets it SET LOCAL ROLE down.
GRANT base_assist_cloud TO base;

GRANT SELECT ON todos, projects, notes, events TO base_assist_cloud;
-- The lane also reads and writes its own queue through the same transaction.
GRANT SELECT, INSERT, UPDATE ON suggestions, assist_passes TO base_assist_cloud;
GRANT USAGE ON SEQUENCE suggestions_id_seq, assist_passes_id_seq TO base_assist_cloud;

-- Belt against future grants: nothing here touches transactions, budgets,
-- merch, or anything else. Additions must be made here, on purpose, by hand.
