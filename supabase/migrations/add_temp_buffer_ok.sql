ALTER TABLE bot_decisions ADD COLUMN IF NOT EXISTS temp_buffer_ok boolean;

UPDATE bot_state SET stop_loss_pct = 0.70, min_hours_to_close = 3.0 WHERE id = 1;
