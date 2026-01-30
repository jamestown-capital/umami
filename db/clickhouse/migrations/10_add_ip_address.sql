ALTER TABLE umami.website_event ADD COLUMN IF NOT EXISTS ip_address String AFTER user_agent;
