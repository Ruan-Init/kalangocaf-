/** SQL aditivo compartilhado pela migração local e fixtures de teste. */
export const newsletterSchemaSql = `
CREATE TABLE IF NOT EXISTS newsletter_subscribers (
 id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'subscribed', unsubscribe_token TEXT NOT NULL UNIQUE,
 source TEXT NOT NULL DEFAULT 'newsletter', subscribed_at INTEGER NOT NULL, unsubscribed_at INTEGER
);
CREATE TABLE IF NOT EXISTS newsletter_campaigns (
 id INTEGER PRIMARY KEY AUTOINCREMENT, creation_key TEXT NOT NULL UNIQUE, subject TEXT NOT NULL,
 message TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft', send_lock TEXT, lock_at INTEGER,
 created_at INTEGER NOT NULL, started_at INTEGER, completed_at INTEGER
);
CREATE TABLE IF NOT EXISTS newsletter_recipients (
 id INTEGER PRIMARY KEY AUTOINCREMENT, campaign_id INTEGER NOT NULL REFERENCES newsletter_campaigns(id),
 subscriber_id INTEGER NOT NULL REFERENCES newsletter_subscribers(id), email TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'queued', provider_id TEXT, error TEXT, accepted_at INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS newsletter_recipient_unique ON newsletter_recipients(campaign_id,subscriber_id);
CREATE TABLE IF NOT EXISTS newsletter_batches (
 id TEXT PRIMARY KEY, campaign_id INTEGER NOT NULL REFERENCES newsletter_campaigns(id),
 status TEXT NOT NULL DEFAULT 'processing', recipient_ids TEXT NOT NULL, error TEXT, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS order_emails (
 key TEXT PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id), audience TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending', provider_id TEXT, error TEXT, attempted_at INTEGER, accepted_at INTEGER
);
`;

export const newsletterLegacySql = `
INSERT OR IGNORE INTO newsletter_subscribers(email,name,status,unsubscribe_token,source,subscribed_at)
 SELECT lower(trim(email)),max(name),'subscribed',lower(hex(randomblob(32))),'legacy_newsletter',min(created_at)
 FROM leads WHERE kind='newsletter' AND trim(email)<>'' GROUP BY lower(trim(email));
`;