-- Executed once by the release step, including after importing historical data.
CREATE FUNCTION migrate_checkpoints_v2() RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE changed bigint;
BEGIN
 UPDATE documents d SET data=jsonb_set(d.data,'{rows}',COALESCE((SELECT jsonb_agg(value) FROM jsonb_array_elements(d.data->'rows') WHERE value->>'collection'<>'checkpoints'),'[]'::jsonb))
 WHERE collection='checkpoints' AND EXISTS(SELECT 1 FROM jsonb_array_elements(d.data->'rows') WHERE value->>'collection'='checkpoints');
 GET DIAGNOSTICS changed=ROW_COUNT;
 RETURN changed;
END $$;
SELECT migrate_checkpoints_v2();
