import { describe, expect, it } from "vitest";

import { productInputSchema } from "../schemas";

const validSizes = [
  { size: "personal" as const, price_cents: 1_800_000 },
  { size: "pequena" as const, price_cents: 2_800_000 },
  { size: "mediana" as const, price_cents: 3_800_000 },
  { size: "grande" as const, price_cents: 4_800_000 },
  { size: "familiar" as const, price_cents: 5_800_000 },
];

const baseProduct = {
  name: "Hawaiana",
  category: "pizza" as const,
  description: "Jamón y piña",
  image_url: null,
  max_flavors: 2,
  min_size_for_multiflavor: "pequena" as const,
  sizes: validSizes,
};

describe("productInputSchema", () => {
  it("accepts a valid product with the 5 distinct sizes", () => {
    const result = productInputSchema.safeParse(baseProduct);
    expect(result.success).toBe(true);
  });

  it("rejects when sizes.length !== 5", () => {
    const result = productInputSchema.safeParse({
      ...baseProduct,
      sizes: validSizes.slice(0, 4),
    });
    expect(result.success).toBe(false);
  });

  it("rejects when sizes are duplicated", () => {
    const dupSizes = [
      ...validSizes.slice(0, 4),
      { size: "personal" as const, price_cents: 9_999_999 },
    ];
    const result = productInputSchema.safeParse({
      ...baseProduct,
      sizes: dupSizes,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative or non-integer prices", () => {
    const negResult = productInputSchema.safeParse({
      ...baseProduct,
      sizes: [{ ...validSizes[0], price_cents: -1 }, ...validSizes.slice(1)],
    });
    expect(negResult.success).toBe(false);

    const floatResult = productInputSchema.safeParse({
      ...baseProduct,
      sizes: [{ ...validSizes[0], price_cents: 100.5 }, ...validSizes.slice(1)],
    });
    expect(floatResult.success).toBe(false);
  });

  it("allows min_size_for_multiflavor to be null or a valid size", () => {
    expect(
      productInputSchema.safeParse({
        ...baseProduct,
        min_size_for_multiflavor: null,
      }).success,
    ).toBe(true);

    expect(
      productInputSchema.safeParse({
        ...baseProduct,
        min_size_for_multiflavor: "grande",
      }).success,
    ).toBe(true);
  });

  it("requires image_url to be a valid URL or null", () => {
    expect(
      productInputSchema.safeParse({
        ...baseProduct,
        image_url: "not-a-url",
      }).success,
    ).toBe(false);

    expect(
      productInputSchema.safeParse({
        ...baseProduct,
        image_url: "https://example.com/img.jpg",
      }).success,
    ).toBe(true);

    expect(
      productInputSchema.safeParse({
        ...baseProduct,
        image_url: null,
      }).success,
    ).toBe(true);
  });

  it("rejects an empty name and a too-long name", () => {
    expect(
      productInputSchema.safeParse({ ...baseProduct, name: "" }).success,
    ).toBe(false);
    expect(
      productInputSchema.safeParse({
        ...baseProduct,
        name: "x".repeat(81),
      }).success,
    ).toBe(false);
  });
});
