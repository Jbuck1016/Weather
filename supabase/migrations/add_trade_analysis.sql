CREATE TABLE IF NOT EXISTS trade_analysis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  bot_trade_id uuid REFERENCES bot_trades(id) UNIQUE,
  market_ticker text NOT NULL,
  city text NOT NULL,
  market_date date,
  market_type text,

  edge_at_entry numeric,
  kalshi_prob_at_entry numeric,
  model_prob_at_entry numeric,
  inter_model_spread_at_entry numeric,
  entry_price_cents numeric,
  entry_hour_pacific integer,
  entry_session text,
  hours_held numeric,

  forecast_temp_at_entry numeric,
  actual_high numeric,
  forecast_error_f numeric,
  forecast_abs_error_f numeric,

  edge_at_close numeric,
  edge_compression numeric,

  settlement_result text,
  gross_pnl numeric,
  net_pnl numeric,
  roi_pct numeric,

  top_models text[],
  model_count integer,
  forecast_source text
);

CREATE INDEX IF NOT EXISTS trade_analysis_city_idx ON trade_analysis(city);
CREATE INDEX IF NOT EXISTS trade_analysis_created_idx ON trade_analysis(created_at DESC);
