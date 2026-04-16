ALTER TABLE bot_state ADD COLUMN IF NOT EXISTS min_kalshi_prob_to_hold numeric DEFAULT 0.02;
ALTER TABLE bot_state ALTER COLUMN max_open_positions SET DEFAULT 7;
UPDATE bot_state SET max_open_positions = 7, max_daily_spend = 350.00 WHERE id = 1;
