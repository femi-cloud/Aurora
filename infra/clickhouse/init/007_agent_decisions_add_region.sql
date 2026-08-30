ALTER TABLE aurora.agent_decisions
ADD COLUMN IF NOT EXISTS region String DEFAULT '';