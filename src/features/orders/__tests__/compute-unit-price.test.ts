import { describe, expect, it } from "vitest";

import { computeUnitPrice } from "../compute-unit-price";

const base = "00000000-0000-0000-0000-0000000000b0";
const f1 = "00000000-0000-0000-0000-0000000000f1";
const f2 = "00000000-0000-0000-0000-0000000000f2";
const f3 = "00000000-0000-0000-0000-0000000000f3";
const f4 = "00000000-0000-0000-0000-0000000000f4";

function mapOf(entries: [string, number][]): Map<string, number> {
  return new Map(entries);
}

describe("computeUnitPrice", () => {
  it("uses baseProduct price when no flavors are provided", () => {
    const priceMap = mapOf([[`${base}:mediana`, 38000]]);
    const r = computeUnitPrice({
      baseProductId: base,
      flavors: undefined,
      size: "mediana",
      priceMap,
    });
    expect(r).toEqual({ ok: true, price: 38000 });
  });

  it("uses baseProduct price when flavors is an empty array", () => {
    const priceMap = mapOf([[`${base}:mediana`, 38000]]);
    const r = computeUnitPrice({
      baseProductId: base,
      flavors: [],
      size: "mediana",
      priceMap,
    });
    expect(r).toEqual({ ok: true, price: 38000 });
  });

  it("includes base price in the max when a single flavor is provided", () => {
    const priceMap = mapOf([
      [`${base}:familiar`, 63000],
      [`${f1}:familiar`, 45000],
    ]);
    const r = computeUnitPrice({
      baseProductId: base,
      flavors: [f1],
      size: "familiar",
      priceMap,
    });
    // Base > flavor → base wins (Hawaiana main + Marinera-cheaper flavor case).
    expect(r).toEqual({ ok: true, price: 63000 });
  });

  it("flavor wins when it is higher than base", () => {
    const priceMap = mapOf([
      [`${base}:familiar`, 63000],
      [`${f1}:familiar`, 93000],
    ]);
    const r = computeUnitPrice({
      baseProductId: base,
      flavors: [f1],
      size: "familiar",
      priceMap,
    });
    // Hawaiana main + Marinera flavor at familiar = $93.000.
    expect(r).toEqual({ ok: true, price: 93000 });
  });

  it("takes the max across base + two flavors", () => {
    const priceMap = mapOf([
      [`${base}:mediana`, 42000],
      [`${f1}:mediana`, 38000],
      [`${f2}:mediana`, 45000],
    ]);
    const r = computeUnitPrice({
      baseProductId: base,
      flavors: [f1, f2],
      size: "mediana",
      priceMap,
    });
    expect(r).toEqual({ ok: true, price: 45000 });
  });

  it("takes the max across base + three flavors", () => {
    const priceMap = mapOf([
      [`${base}:grande`, 53000],
      [`${f1}:grande`, 58000],
      [`${f2}:grande`, 56000],
      [`${f3}:grande`, 60000],
    ]);
    const r = computeUnitPrice({
      baseProductId: base,
      flavors: [f1, f2, f3],
      size: "grande",
      priceMap,
    });
    expect(r).toEqual({ ok: true, price: 60000 });
  });

  it("takes the max across base + four flavors", () => {
    const priceMap = mapOf([
      [`${base}:familiar`, 63000],
      [`${f1}:familiar`, 70000],
      [`${f2}:familiar`, 72000],
      [`${f3}:familiar`, 68000],
      [`${f4}:familiar`, 93000],
    ]);
    const r = computeUnitPrice({
      baseProductId: base,
      flavors: [f1, f2, f3, f4],
      size: "familiar",
      priceMap,
    });
    expect(r).toEqual({ ok: true, price: 93000 });
  });

  it("returns flavor_missing when a flavor has no price for the size", () => {
    const priceMap = mapOf([
      [`${base}:mediana`, 38000],
      [`${f1}:mediana`, 41000],
    ]);
    const r = computeUnitPrice({
      baseProductId: base,
      flavors: [f1, f2],
      size: "mediana",
      priceMap,
    });
    expect(r).toEqual({ ok: false, reason: "flavor_missing" });
  });

  it("returns product_or_size when the base has no price for the size (no flavors)", () => {
    const priceMap = mapOf([[`${base}:pequena`, 28000]]);
    const r = computeUnitPrice({
      baseProductId: base,
      flavors: undefined,
      size: "mediana",
      priceMap,
    });
    expect(r).toEqual({ ok: false, reason: "product_or_size" });
  });

  it("returns product_or_size when the base has no price and flavors are provided", () => {
    const priceMap = mapOf([[`${f1}:mediana`, 41000]]);
    const r = computeUnitPrice({
      baseProductId: base,
      flavors: [f1],
      size: "mediana",
      priceMap,
    });
    expect(r).toEqual({ ok: false, reason: "product_or_size" });
  });
});
