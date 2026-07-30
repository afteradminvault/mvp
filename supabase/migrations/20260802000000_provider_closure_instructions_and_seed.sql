-- PRD v2 / Milestone 4 feature 1-2 (Account Closure Module: Platform
-- Database Search/Browse, Per-Platform Closure Instructions).
--
-- 1. `closure_instructions` is new, distinct from the existing `notes`
--    column: `notes` is explicitly staff-internal ("Internal notes... e.g.
--    quirks in their closure process" — src/app/admin/providers's own
--    placeholder copy), while US-5.2 asks for family-facing step-by-step
--    instructions. Reusing `notes` would risk leaking internal-only
--    content to Family members reading the closure module, so this is a
--    genuinely new field rather than the same "expand in place" pattern
--    the sibling closure/bereavement columns used.
--
-- 2. Seeds ~55 well-known platform NAMES + default_category + website_url
--    only (public, easily-verifiable facts) satisfying "seeded with the
--    full 50+ platform catalog." closure_method/closure_instructions/
--    bereavement_contact_*/logo_url are deliberately left null for every
--    seeded row: fabricating a specific bereavement phone number or
--    closure process for a real company would be actively misleading if
--    wrong, and a grieving family member is exactly the wrong audience to
--    hand incorrect contact details to. These fields exist and are
--    editable via the admin providers UI (this migration doesn't change
--    that surface) — populating them with verified information is a
--    content task for AfterVault staff, not something to guess here.
--    A representative dozen are marked is_common_onboarding_platform so
--    the Milestone 0/2 onboarding checklist (previously seeing zero
--    platforms, since providers was empty before this migration) has
--    something to show.

alter table providers add column closure_instructions text null;

insert into providers (name, default_category, website_url, is_common_onboarding_platform) values
  ('Chase', 'financial', 'https://www.chase.com', true),
  ('Bank of America', 'financial', 'https://www.bankofamerica.com', true),
  ('Wells Fargo', 'financial', 'https://www.wellsfargo.com', false),
  ('Citibank', 'financial', 'https://www.citi.com', false),
  ('Capital One', 'financial', 'https://www.capitalone.com', false),
  ('PayPal', 'financial', 'https://www.paypal.com', true),
  ('Venmo', 'financial', 'https://venmo.com', false),
  ('American Express', 'financial', 'https://www.americanexpress.com', false),
  ('Charles Schwab', 'financial', 'https://www.schwab.com', false),
  ('Fidelity Investments', 'financial', 'https://www.fidelity.com', false),
  ('Vanguard', 'financial', 'https://investor.vanguard.com', false),
  ('Ally Bank', 'financial', 'https://www.ally.com', false),
  ('Facebook', 'social', 'https://www.facebook.com', true),
  ('Instagram', 'social', 'https://www.instagram.com', true),
  ('X (Twitter)', 'social', 'https://x.com', false),
  ('LinkedIn', 'social', 'https://www.linkedin.com', true),
  ('TikTok', 'social', 'https://www.tiktok.com', false),
  ('Snapchat', 'social', 'https://www.snapchat.com', false),
  ('Pinterest', 'social', 'https://www.pinterest.com', false),
  ('Reddit', 'social', 'https://www.reddit.com', false),
  ('Netflix', 'subscription', 'https://www.netflix.com', true),
  ('Spotify', 'subscription', 'https://www.spotify.com', true),
  ('Hulu', 'subscription', 'https://www.hulu.com', false),
  ('Disney+', 'subscription', 'https://www.disneyplus.com', false),
  ('Amazon Prime', 'subscription', 'https://www.amazon.com/prime', false),
  ('YouTube Premium', 'subscription', 'https://www.youtube.com/premium', false),
  ('Apple Music', 'subscription', 'https://music.apple.com', false),
  ('HBO Max', 'subscription', 'https://www.max.com', false),
  ('Adobe Creative Cloud', 'subscription', 'https://www.adobe.com/creativecloud.html', false),
  ('Microsoft 365', 'subscription', 'https://www.microsoft.com/microsoft-365', false),
  ('Coinbase', 'crypto', 'https://www.coinbase.com', true),
  ('Binance.US', 'crypto', 'https://www.binance.us', false),
  ('Kraken', 'crypto', 'https://www.kraken.com', false),
  ('Gemini', 'crypto', 'https://www.gemini.com', false),
  ('Google Drive', 'cloud_storage', 'https://drive.google.com', true),
  ('Dropbox', 'cloud_storage', 'https://www.dropbox.com', false),
  ('Apple iCloud', 'cloud_storage', 'https://www.icloud.com', true),
  ('Microsoft OneDrive', 'cloud_storage', 'https://onedrive.live.com', false),
  ('Box', 'cloud_storage', 'https://www.box.com', false),
  ('GoDaddy', 'domain', 'https://www.godaddy.com', true),
  ('Namecheap', 'domain', 'https://www.namecheap.com', false),
  ('Google Domains', 'domain', 'https://domains.google', false),
  ('Cloudflare', 'domain', 'https://www.cloudflare.com', false),
  ('Gmail (Google Account)', 'other', 'https://myaccount.google.com', true),
  ('Outlook (Microsoft Account)', 'other', 'https://account.microsoft.com', true),
  ('Yahoo', 'other', 'https://www.yahoo.com', false),
  ('Amazon', 'other', 'https://www.amazon.com', true),
  ('eBay', 'other', 'https://www.ebay.com', false),
  ('Uber', 'other', 'https://www.uber.com', false),
  ('Airbnb', 'other', 'https://www.airbnb.com', false),
  ('DoorDash', 'other', 'https://www.doordash.com', false),
  ('Zoom', 'other', 'https://zoom.us', false),
  ('Slack', 'other', 'https://slack.com', false),
  ('WhatsApp', 'other', 'https://www.whatsapp.com', false),
  ('Discord', 'other', 'https://discord.com', false);

notify pgrst, 'reload schema';
