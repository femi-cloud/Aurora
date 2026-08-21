ALTER TABLE aurora.audience_events 
ADD COLUMN IF NOT EXISTS poster_url Nullable(String);