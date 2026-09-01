import { describe, expect, it } from "vitest";

import { normalizeWhatsappTarget } from "../whatsapp-groups.server";

describe("normalizeWhatsappTarget", () => {
  it.each([
    [
      "https://chat.whatsapp.com/AbCdEf123?mode=gi_t",
      "https://chat.whatsapp.com/AbCdEf123?mode=gi_t",
    ],
    ["HTTPS://WA.ME/5565999999999#ignored", "https://wa.me/5565999999999"],
    [
      "https://api.whatsapp.com/send?phone=5565999999999",
      "https://api.whatsapp.com/send?phone=5565999999999",
    ],
  ])("accepts and normalizes an official HTTPS URL: %s", (input, expected) => {
    expect(normalizeWhatsappTarget(input)).toEqual({ inviteUrl: expected, phone: null });
  });

  it.each([
    "http://chat.whatsapp.com/AbCdEf123",
    "ftp://chat.whatsapp.com/AbCdEf123",
    "javascript:alert(1)",
    "//chat.whatsapp.com/AbCdEf123",
  ])("rejects unsupported or missing protocols: %s", (input) => {
    expect(() => normalizeWhatsappTarget(input)).toThrow();
  });

  it.each([
    "https://user@chat.whatsapp.com/AbCdEf123",
    "https://user:secret@wa.me/5565999999999",
  ])("rejects URL credentials: %s", (input) => {
    expect(() => normalizeWhatsappTarget(input)).toThrow(/credenciais/i);
  });

  it.each([
    "https://chat.whatsapp.com:443/AbCdEf123",
    "https://wa.me:8443/5565999999999",
  ])("rejects explicit ports, including the default HTTPS port: %s", (input) => {
    expect(() => normalizeWhatsappTarget(input)).toThrow(/porta/i);
  });

  it.each([
    "https://evil.example/?next=chat.whatsapp.com/AbCdEf123",
    "https://chat.whatsapp.com.evil.example/AbCdEf123",
    "https://sub.chat.whatsapp.com/AbCdEf123",
    "https://whatsapp.com/AbCdEf123",
    "https://chat.whatsapp.com./AbCdEf123",
    "https://chat%2ewhatsapp.com/AbCdEf123",
    "https://chat.whatsapp.com@evil.example/AbCdEf123",
  ])("rejects malicious, unofficial or obfuscated hosts: %s", (input) => {
    expect(() => normalizeWhatsappTarget(input)).toThrow();
  });

  it("normalizes a formatted phone number to digits", () => {
    expect(normalizeWhatsappTarget("+55 (65) 99999-9999")).toEqual({
      inviteUrl: null,
      phone: "5565999999999",
    });
  });

  it.each([
    "evil.example/5565999999999",
    "phone:5565999999999",
    "55 65 99999 9999 ext 1",
    "123",
  ])("rejects malformed phone input instead of extracting arbitrary digits: %s", (input) => {
    expect(() => normalizeWhatsappTarget(input)).toThrow();
  });
});
