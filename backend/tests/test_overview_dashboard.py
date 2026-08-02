from datetime import UTC, datetime

from app.data_sources.domain import MarketSnapshotBatch, MarketSnapshotQuote
from app.overview.service import build_market_breadth


def test_build_market_breadth_assigns_distribution_boundaries() -> None:
    changes = [-11, -10, -6, -4, -1, 0, 1, 4, 6, 8, 11, None]
    batch = MarketSnapshotBatch(
        quotes=[
            MarketSnapshotQuote(
                thscode=f"{index:06d}.SZ",
                change_percent=change,
                turnover=100,
            )
            for index, change in enumerate(changes)
        ],
        total=len(changes),
        quoted_at=datetime(2026, 8, 2, tzinfo=UTC),
        fetched_at=datetime(2026, 8, 2, tzinfo=UTC),
    )

    result = build_market_breadth(batch)

    assert [item.count for item in result.bins] == [1] * 11
    assert result.valid_count == 11
    assert result.down_count == 5
    assert result.flat_count == 1
    assert result.up_count == 5
    assert result.strong_down_count == 2
    assert result.strong_up_count == 1
    assert result.turnover == 1200
