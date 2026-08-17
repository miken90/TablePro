import { describe, it, expect } from "vitest";
import { parseDeepLinkUrl } from "../utils/deep-link-handler";

describe("parseDeepLinkUrl", () => {
  it("parses valid open connection URL", () => {
    const result = parseDeepLinkUrl("tablepro://open/connection/abc-123");
    expect(result).toEqual({
      type: "open-connection",
      connectionId: "abc-123",
    });
  });

  it("parses URL-encoded connection ID", () => {
    const result = parseDeepLinkUrl("tablepro://open/connection/my%20conn%2F1");
    expect(result).toEqual({
      type: "open-connection",
      connectionId: "my conn/1",
    });
  });

  it("handles UUID connection ID", () => {
    const id = "550e8400-e29b-41d4-a716-446655440000";
    const result = parseDeepLinkUrl(`tablepro://open/connection/${id}`);
    expect(result).toEqual({
      type: "open-connection",
      connectionId: id,
    });
  });

  it("returns null for non-tablepro protocol", () => {
    expect(parseDeepLinkUrl("https://open/connection/abc")).toBeNull();
  });

  it("returns null for unknown action", () => {
    expect(parseDeepLinkUrl("tablepro://import/connection/abc")).toBeNull();
  });

  it("returns null for missing connection ID", () => {
    expect(parseDeepLinkUrl("tablepro://open/connection/")).toBeNull();
  });

  it("returns null for incomplete path", () => {
    expect(parseDeepLinkUrl("tablepro://open")).toBeNull();
  });

  it("returns null for completely invalid URL", () => {
    expect(parseDeepLinkUrl("not a url at all")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseDeepLinkUrl("")).toBeNull();
  });

  it("strips trailing slashes", () => {
    const result = parseDeepLinkUrl("tablepro://open/connection/abc/");
    expect(result).toEqual({
      type: "open-connection",
      connectionId: "abc",
    });
  });

  it("returns null for extra path segments", () => {
    expect(parseDeepLinkUrl("tablepro://open/connection/abc/extra")).toBeNull();
  });
});
