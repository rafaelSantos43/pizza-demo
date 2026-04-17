import { describe, expect, it } from "vitest";

import { detectIntent, normalize } from "../intents";

describe("normalize", () => {
  it("strips diacritics, lowercases, trims", () => {
    expect(normalize("  ¿Cuánto Falta?  ")).toBe("¿cuanto falta?");
    expect(normalize("Pizzería")).toBe("pizzeria");
    expect(normalize("ÑOÑO")).toBe("nono");
  });

  it("handles empty / whitespace input", () => {
    expect(normalize("")).toBe("");
    expect(normalize("   ")).toBe("");
  });
});

describe("detectIntent — status_inquiry", () => {
  it("matches plain ya?", () => {
    expect(detectIntent("ya?")).toBe("status_inquiry");
    expect(detectIntent("Ya")).toBe("status_inquiry");
  });

  it("matches ¿cuánto falta? with accents and punctuation", () => {
    expect(detectIntent("¿cuánto falta?")).toBe("status_inquiry");
    expect(detectIntent("Cuánto Falta")).toBe("status_inquiry");
  });

  it("matches ya viene? variations", () => {
    expect(detectIntent("ya viene?")).toBe("status_inquiry");
    expect(detectIntent("Ya viene??")).toBe("status_inquiry");
  });

  it("matches dónde está mi pedido", () => {
    expect(detectIntent("Dónde está mi pedido")).toBe("status_inquiry");
    expect(detectIntent("donde va")).toBe("status_inquiry");
  });

  it("matches mi orden / mi pedido", () => {
    expect(detectIntent("Cómo va mi orden")).toBe("status_inquiry");
    expect(detectIntent("mi pedido?")).toBe("status_inquiry");
  });
});

describe("detectIntent — greet", () => {
  it("matches saludos básicos", () => {
    expect(detectIntent("Hola")).toBe("greet");
    expect(detectIntent("Buenas")).toBe("greet");
    expect(detectIntent("Buenos días")).toBe("greet");
    expect(detectIntent("Buenas tardes!")).toBe("greet");
  });

  it("matches intentos de pedir", () => {
    expect(detectIntent("quiero pedir")).toBe("greet");
    expect(detectIntent("ordenar pizza")).toBe("greet");
    expect(detectIntent("Tienen menú?")).toBe("greet");
    expect(detectIntent("la carta")).toBe("greet");
  });

  it("default: cualquier texto no reconocido cae en greet", () => {
    expect(detectIntent("xyz random text")).toBe("greet");
    expect(detectIntent("")).toBe("greet");
  });
});
