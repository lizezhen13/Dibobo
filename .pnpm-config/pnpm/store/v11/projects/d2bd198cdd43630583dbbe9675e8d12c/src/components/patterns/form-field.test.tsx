import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FormField } from "./form-field";
import { Input } from "../ui/input";

describe("FormField", () => {
  it("connects labels, hints and errors to the control", () => {
    render(
      <FormField label="名称" hint="最多 40 个字符" error="名称不能为空" required>
        <Input />
      </FormField>,
    );

    const input = screen.getByLabelText(/名称/);
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-required", "true");
    expect(input.getAttribute("aria-describedby")).toContain(`${input.id}-hint`);
    expect(input.getAttribute("aria-describedby")).toContain(`${input.id}-error`);
    expect(screen.getByRole("alert")).toHaveTextContent("名称不能为空");
  });
});
