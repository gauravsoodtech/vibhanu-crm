import { describe, expect, it } from "vitest";
import { listenedFully, maskPhone, missingFields, nextStage, normalizePhone, pickEditable } from "./workflow";

describe("workflow", () => {
  it("moves each lead one step, only by the owning role", () => {
    expect(nextStage("communication", "communication")).toBe("vigilance");
    expect(nextStage("vigilance", "vigilance")).toBe("support");
    expect(nextStage("support", "support")).toBe("sales");
    expect(nextStage("sales", "sales")).toBe("claimed");
    expect(nextStage("sales", "support")).toBeNull();
    expect(nextStage("marketing", "communication")).toBeNull();
    expect(nextStage("support", "claimed")).toBeNull();
  });

  it("never lets anyone after Marketing edit the contact number", () => {
    for (const role of ["communication", "vigilance", "support", "sales"] as const) {
      expect(pickEditable(role, { contact_number: "9999999999", name: "A" })).not.toHaveProperty("contact_number");
    }
    expect(pickEditable("marketing", { contact_number: " 9876543210 " })).toEqual({ contact_number: "9876543210" });
    expect(pickEditable("support", { name: "x" })).toEqual({});
    expect(pickEditable("communication", { project: "M3M", budget: "1 to 2 Cr" })).toEqual({ project: "M3M", budget: "1 to 2 Cr" });
    expect(pickEditable("vigilance", { project: "Omaxe" })).toEqual({ project: "Omaxe" });
    expect(pickEditable("support", { project: "M3M" })).toEqual({});
  });

  it("requires meeting details before Meeting / Verified", () => {
    expect(missingFields("communication", { name: "A" })).toEqual(["postal_address", "visit_date", "visit_time"]);
    expect(missingFields("vigilance", { name: "A", postal_address: "x", visit_date: "d", visit_time: "t" })).toEqual([]);
  });

  it("normalises and masks Indian mobiles", () => {
    expect(normalizePhone("+91 98765-43210")).toBe("9876543210");
    expect(normalizePhone("09876543210")).toBe("9876543210");
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("5876543210")).toBeNull();
    expect(maskPhone("9876543210")).toBe("98xxxxxx10");
  });

  it("only counts a full listen", () => {
    const t0 = new Date("2026-10-15T15:00:00Z");
    expect(listenedFully(t0, new Date(t0.getTime() + 20_000), 20.3)).toBe(true);
    expect(listenedFully(t0, new Date(t0.getTime() + 5_000), 20.3)).toBe(false);
  });
});
