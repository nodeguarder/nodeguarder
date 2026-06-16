-- Migration: Drop was_cached column from agent_request_metrics
-- (was_cached was only ever true for non-streaming requests with 0% hit rate)
ALTER TABLE agent_request_metrics DROP COLUMN IF EXISTS was_cached;
