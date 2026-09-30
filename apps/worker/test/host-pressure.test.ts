import { expect, it } from "vitest";
import { parsePressure, parseCpuTicks } from "../src/host-pressure";
it("reports unavailable pressure explicitly and validates percent ranges", () => {
  expect(parsePressure("")).toBe(null);
  expect(parsePressure("some avg10=23.45 avg60=2.00 total=100")).toBe(23.45);
  expect(parsePressure("some avg10=101.00")).toBe(null);
});
it("does not count guest CPU twice and rejects malformed counters", () => {
  expect(parseCpuTicks("cpu  10 0 20 30 5 5 5 25 100 100")).toEqual({
    total: 100,
    steal: 25,
  });
  expect(parseCpuTicks("cpu invalid")).toBe(null);
});
