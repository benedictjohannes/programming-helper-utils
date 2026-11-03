export function calculateTotal(items: number[]): number {
  return items.reduce((sum, item) => sum + item, 0);
}

describe("calculateTotal suite", () => {
  it("should sum empty list to 0", () => {
    expect(calculateTotal([])).toBe(0);
  });

  it("should sum multiple items", () => {
    expect(calculateTotal([1, 2, 3])).toBe(6);
  });
});

test("standalone sanity check", () => {
  expect(1 + 1).toBe(2);
});

export function helper(): string {
  return "helper ready";
}
