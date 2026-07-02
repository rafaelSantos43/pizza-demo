import { describe, expect, it } from "vitest";

import { detectIntent, normalize } from "../intents";

describe("normalize", () => {
  it("strips diacritics, lowercases, trims", () => {
    expect(normalize("  \u00bfCu\u00e1nto Falta?  ")).toBe(
      "\u00bfcuanto falta?",
    );
    expect(normalize("Pizzer\u00eda")).toBe("pizzeria");
    expect(normalize("\u00d1O\u00d1O")).toBe("nono");
  });

  it("handles empty / whitespace input", () => {
    expect(normalize("")).toBe("");
    expect(normalize("   ")).toBe("");
  });
});

describe("detectIntent - status_inquiry", () => {
  it("matches plain ya?", () => {
    expect(detectIntent("ya?")).toBe("status_inquiry");
    expect(detectIntent("Ya")).toBe("status_inquiry");
  });

  it("matches cuanto falta with accents and punctuation", () => {
    expect(detectIntent("\u00bfcu\u00e1nto falta?")).toBe(
      "status_inquiry",
    );
    expect(detectIntent("Cu\u00e1nto Falta")).toBe("status_inquiry");
  });

  it("matches ya viene? variations", () => {
    expect(detectIntent("ya viene?")).toBe("status_inquiry");
    expect(detectIntent("Ya viene??")).toBe("status_inquiry");
  });

  it("matches donde esta mi pedido", () => {
    expect(detectIntent("D\u00f3nde est\u00e1 mi pedido")).toBe(
      "status_inquiry",
    );
    expect(detectIntent("donde va")).toBe("status_inquiry");
  });

  it("matches mi orden / mi pedido", () => {
    expect(detectIntent("C\u00f3mo va mi orden")).toBe("status_inquiry");
    expect(detectIntent("mi pedido?")).toBe("status_inquiry");
  });
});

describe("detectIntent - greet", () => {
  it("matches saludos basicos", () => {
    expect(detectIntent("Hola")).toBe("greet");
    expect(detectIntent("Buenas")).toBe("greet");
    expect(detectIntent("Buenos d\u00edas")).toBe("greet");
    expect(detectIntent("Buenas tardes!")).toBe("greet");
  });

  it("matches intentos de pedir", () => {
    expect(detectIntent("quiero pedir")).toBe("greet");
    expect(detectIntent("ordenar pizza")).toBe("greet");
    expect(detectIntent("Tienen men\u00fa?")).toBe("greet");
    expect(detectIntent("la carta")).toBe("greet");
  });
});

describe("detectIntent - courtesy", () => {
  it("matches acknowledgements and thanks", () => {
    expect(detectIntent("Ok")).toBe("courtesy");
    expect(detectIntent("gracias")).toBe("courtesy");
    expect(detectIntent("\u{1f44d}")).toBe("courtesy");
  });
});

describe("detectIntent - unknown", () => {
  it("does not default random text to greet", () => {
    expect(detectIntent("xyz random text")).toBe("unknown");
    expect(detectIntent("")).toBe("unknown");
  });
});
