import { describe, expect, it } from "vitest";

import { canTransition } from "../state-machine";

describe("canTransition", () => {
  describe("delivery (default)", () => {
    it("allows ready → on_the_way", () => {
      expect(canTransition("ready", "on_the_way")).toBe(true);
      expect(canTransition("ready", "on_the_way", "delivery")).toBe(true);
    });

    it("forbids ready → delivered (driver must go through on_the_way)", () => {
      expect(canTransition("ready", "delivered")).toBe(false);
      expect(canTransition("ready", "delivered", "delivery")).toBe(false);
    });

    it("allows on_the_way → delivered", () => {
      expect(canTransition("on_the_way", "delivered", "delivery")).toBe(true);
    });

    it("allows preparing → ready", () => {
      expect(canTransition("preparing", "ready", "delivery")).toBe(true);
    });
  });

  describe("pickup", () => {
    it("forbids ready → on_the_way (no driver involved)", () => {
      expect(canTransition("ready", "on_the_way", "pickup")).toBe(false);
    });

    it("allows ready → delivered (customer picks up directly)", () => {
      expect(canTransition("ready", "delivered", "pickup")).toBe(true);
    });

    it("allows preparing → ready", () => {
      expect(canTransition("preparing", "ready", "pickup")).toBe(true);
    });

    it("allows ready → cancelled", () => {
      expect(canTransition("ready", "cancelled", "pickup")).toBe(true);
    });
  });
});
