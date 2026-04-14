CREATE TABLE IF NOT EXISTS position_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  captured_at timestamptz DEFAULT now(),
  bot_trade_id uuid REFERENCES bot_trades(id),
  market_ticker text NOT NULL,
  city text NOT NULL,
  hours_since_entry numeric,
  hours_to_close numeric,
  yes_bid_cents integer,
  yes_ask_cents integer,
  kalshi_prob numeric,
  nws_prob numeric,
  edge_pct numeric,
  fee_adjusted_ev_pct numeric,
  inter_model_spread numeric,
  forecast_temp numeric,
  volume integer
);

CREATE INDEX IF NOT EXISTS position_snapshots_trade_id_idx
  ON position_snapshots(bot_trade_id, captured_at);
