import { describe, expect, it } from "vitest";
import { canonicalizeUgcObjectPath } from "@/lib/ugc-media-jobs.server";

describe("canonicalizeUgcObjectPath", () => {
  it("normaliza codificação simples sem alterar a hierarquia", () => {
    expect(canonicalizeUgcObjectPath("partners/abc/posts/image%2Ejpg"))
      .toBe("partners/abc/posts/image.jpg");
  });

  it.each([
    "/partners/abc/posts/image.jpg",
    "partners//posts/image.jpg",
    "partners/./posts/image.jpg",
    "partners/../posts/image.jpg",
    "partners\\abc\\posts\\image.jpg",
    "partners/abc/posts/image.jpg?download=1",
    "partners/abc/posts/image.jpg#fragment",
    "partners/abc/posts/image\u0000.jpg",
    "partners/abc/posts/%252e%252e/secret.jpg",
    "partners/abc/posts/image%252Fsecret.jpg",
    "partners/abc/posts/image%255Csecret.jpg",
    "partners/abc/posts/image%2525252525252525252Ejpg",
  ])("rejeita caminho ambíguo ou perigoso: %s", (value) => {
    expect(() => canonicalizeUgcObjectPath(value)).toThrow();
  });
});
