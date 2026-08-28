import { describe, expect, it } from "vitest";
import { PayerSchema, SourceSchema } from "../mercadopago-checkout";

const SOURCE_ID = "11111111-1111-4111-8111-111111111111";
const PUBLIC_TOKEN = "22222222-2222-4222-8222-222222222222";

describe("Mercado Pago checkout input", () => {
  it("accepts an authenticated source UUID", () => {
    expect(SourceSchema.parse({ kind: "store_order", id: SOURCE_ID })).toEqual({
      kind: "store_order",
      id: SOURCE_ID,
    });
  });

  it("accepts a public bearer token only for shareable order kinds", () => {
    expect(SourceSchema.parse({ kind: "partner_product_order", publicPaymentToken: PUBLIC_TOKEN })).toEqual({
      kind: "partner_product_order",
      publicPaymentToken: PUBLIC_TOKEN,
    });
    expect(() => SourceSchema.parse({ kind: "transaction", publicPaymentToken: PUBLIC_TOKEN })).toThrow();
  });

  it("rejects human-readable order numbers and mixed credentials", () => {
    expect(() => SourceSchema.parse({ kind: "store_order", publicPaymentToken: "FM-1234ABCD" })).toThrow();
    expect(() => SourceSchema.parse({ kind: "store_order", id: SOURCE_ID, publicPaymentToken: PUBLIC_TOKEN })).toThrow();
  });

  it("normalizes payer fields and limits personal data", () => {
    expect(PayerSchema.parse({ email: "  CLIENTE@EXAMPLE.COM ", name: " Cliente " })).toEqual({
      email: "CLIENTE@EXAMPLE.COM",
      name: "Cliente",
    });
    expect(() => PayerSchema.parse({ email: "a@example.com", name: "x".repeat(121) })).toThrow();
  });
});
