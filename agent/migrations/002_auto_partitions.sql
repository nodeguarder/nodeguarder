-- Auto-create audit_log partitions through 2032
-- Run this periodically (or on schema migration) to extend partition range

CREATE OR REPLACE FUNCTION create_audit_partition(target_date timestamptz)
RETURNS void AS $$
DECLARE
    year_start text;
    year_end text;
    partition_name text;
    partition_exists boolean;
BEGIN
    year_start := to_char(date_trunc('quarter', target_date), 'YYYY-MM-DD');
    year_end := to_char(date_trunc('quarter', target_date) + interval '3 months', 'YYYY-MM-DD');
    partition_name := 'audit_logs_' || to_char(target_date, 'YYYY') || '_q' || to_char(target_date, 'Q');

    SELECT EXISTS (
        SELECT 1 FROM pg_class WHERE relname = partition_name
    ) INTO partition_exists;

    IF NOT partition_exists THEN
        EXECUTE format(
            'CREATE TABLE %I PARTITION OF audit_logs FOR VALUES FROM (%L) TO (%L)',
            partition_name, year_start, year_end
        );
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Pre-create partitions 2026 Q1 through 2032 Q4
DO $$
DECLARE
    qtr timestamptz;
BEGIN
    FOR qtr IN
        SELECT generate_series('2026-01-01'::timestamptz, '2032-10-01'::timestamptz, '3 months'::interval)
    LOOP
        PERFORM create_audit_partition(qtr);
    END LOOP;
END;
$$;
