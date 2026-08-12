# Global market adapter fixtures

These are deterministic, redacted-shape fixtures for adapter and quality-gate tests. They are not live market data and must never be used as a production fallback. The Eastmoney global-futures fixture intentionally omits London spot rows; the separate Sina mapping and quote fixtures prove that London spot is fetched through its explicit AKShare route instead of silently substituting futures.
