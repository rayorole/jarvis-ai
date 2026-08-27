import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Greeting } from "@/components/Greeting";

describe("Greeting", () => {
  it("renders a greeting with the given name", () => {
    render(<Greeting name="Jarvis" />);
    expect(screen.getByRole("heading", { name: "Hello, Jarvis!" })).toBeInTheDocument();
  });

  it("renders without a name", () => {
    render(<Greeting />);
    expect(screen.getByRole("heading", { name: "Hello!" })).toBeInTheDocument();
  });
});
