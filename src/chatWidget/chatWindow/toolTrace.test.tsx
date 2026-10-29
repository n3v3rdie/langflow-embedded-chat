import { fireEvent, render, screen } from "@testing-library/react";
import { ToolActivity } from "../toolActivity";
import ToolTrace from "./toolTrace";

const finishedTools: ToolActivity[] = [
  {
    id: "0:search",
    name: "search",
    status: "completed",
    startedAt: 1_000,
    finishedAt: 2_000,
    durationSeconds: 1.2,
    input: { query: "orders" },
    outputText: "3 rows",
    errorText: null,
  },
  {
    id: "1:fetch",
    name: "fetch",
    status: "error",
    startedAt: 2_000,
    finishedAt: 3_000,
    durationSeconds: 0.4,
    input: { id: 7 },
    outputText: null,
    errorText: "timeout",
  },
];

const runningTools: ToolActivity[] = [
  finishedTools[0],
  {
    ...finishedTools[1],
    status: "running",
    finishedAt: null,
    durationSeconds: null,
    errorText: null,
  },
];

describe("ToolTrace", () => {
  test("hides finished tool calls inside one collapsed block", () => {
    render(<ToolTrace tools={finishedTools} live={false} />);

    expect(screen.getByRole("button", { name: /used 2 tools/i })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("search")).not.toBeInTheDocument();
    expect(screen.queryByText("fetch")).not.toBeInTheDocument();
  });

  test("shows each tool while streaming and collapses them when the reply finishes", () => {
    const { rerender } = render(<ToolTrace tools={runningTools} live />);

    expect(screen.getByRole("button", { name: /running fetch/i })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("search")).toBeInTheDocument();
    expect(screen.getByText("fetch")).toBeInTheDocument();

    rerender(<ToolTrace tools={finishedTools} live={false} />);

    expect(screen.getByRole("button", { name: /used 2 tools/i })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("search")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /used 2 tools/i }));

    expect(screen.getByText("search")).toBeInTheDocument();
    expect(screen.getByText("fetch")).toBeInTheDocument();
    expect(screen.getByText("3 rows").closest("details")).not.toHaveAttribute("open");
  });
});
