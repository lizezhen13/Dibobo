import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { PortfolioStockDetailPage } from "./portfolio-stock-detail-page";

describe("portfolio stock detail page", () => {
  it("returns to the portfolio that opened the detail page", () => {
    render(
      <MemoryRouter initialEntries={["/portfolios/detail/portfolio-123/000001"]}>
        <Routes>
          <Route path="/portfolios/detail/:portfolioId/:ticker" element={<PortfolioStockDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "返回" })).toHaveAttribute("href", "/portfolios?portfolio=portfolio-123");
  });
});
