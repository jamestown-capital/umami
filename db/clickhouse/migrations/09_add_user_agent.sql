ALTER TABLE umami.website_event ADD COLUMN IF NOT EXISTS user_agent String AFTER city;
