import { describe, it, expect } from "vitest";
import { sslModeHelp, sslModeHelpKey } from "./ssl-mode-help";
import { SSL_MODES } from "./connection-form-config";
import en from "../../i18n/locales/en.json";
import vi from "../../i18n/locales/vi.json";

/**
 * The helper line under the SSL Mode selector is the only place the app says
 * whether a certificate is actually verified, so it has to match what each
 * driver does. Every expectation here is anchored to driver source, not to the
 * mode's name.
 */
describe("sslModeHelp", () => {
  it("marks PostgreSQL prefer/require as encrypted but unverified", () => {
    expect(sslModeHelp("postgres", "prefer")).toBe("encryptedUnverified");
    expect(sslModeHelp("postgres", "require")).toBe("encryptedUnverified");
  });

  it("marks PostgreSQL verify modes as validated through the system store", () => {
    expect(sslModeHelp("postgres", "verify-ca")).toBe("verifiedSystem");
    expect(sslModeHelp("postgres", "verify-full")).toBe("verifiedSystem");
  });

  it("marks PostgreSQL disable as plaintext", () => {
    expect(sslModeHelp("postgres", "disable")).toBe("plaintext");
  });

  it("marks MySQL prefer as plaintext, because the driver sends no TLS options", () => {
    expect(sslModeHelp("mysql", "disable")).toBe("plaintext");
    expect(sslModeHelp("mysql", "prefer")).toBe("plaintext");
  });

  it("separates the three MySQL TLS levels", () => {
    expect(sslModeHelp("mysql", "require")).toBe("encryptedUnverified");
    expect(sslModeHelp("mysql", "verify-ca")).toBe("verifiedBundledChainOnly");
    expect(sslModeHelp("mysql", "verify-full")).toBe("verifiedBundled");
  });

  it("says SQL Server always encrypts and only verify-full validates", () => {
    for (const mode of ["disable", "prefer", "require", "verify-ca"]) {
      expect(sslModeHelp("mssql", mode)).toBe("encryptedUnverified");
    }
    expect(sslModeHelp("mssql", "verify-full")).toBe("verifiedSystem");
  });

  it("never claims a mode is verified when the driver does not verify it", () => {
    const unverified = [
      ["postgres", "require"],
      ["mysql", "require"],
      ["mssql", "require"],
      ["mssql", "verify-ca"],
    ];
    for (const [dbType, mode] of unverified) {
      expect(sslModeHelp(dbType, mode).startsWith("verified")).toBe(false);
    }
  });
});

describe("sslModeHelpKey", () => {
  const locales: Array<[string, Record<string, unknown>]> = [
    ["en", en],
    ["vi", vi],
  ];

  it.each(locales)("resolves every engine/mode pair in %s", (_name, bundle) => {
    const help = (bundle as { connection: { form: { sslHelp: Record<string, string> } } })
      .connection.form.sslHelp;
    for (const dbType of ["postgres", "mysql", "mssql"]) {
      for (const mode of SSL_MODES) {
        const key = sslModeHelpKey(dbType, mode);
        const leaf = key.split(".").pop() as string;
        expect(key).toBe(`connection.form.sslHelp.${leaf}`);
        expect(help[leaf], `${dbType}/${mode} -> ${key}`).toBeTruthy();
      }
    }
  });

  // Control: a missing translation is detectable — the lookup above is not
  // vacuously true for a key no locale defines.
  it.each(locales)("has no entry for an invented variant in %s", (_name, bundle) => {
    const help = (bundle as { connection: { form: { sslHelp: Record<string, string> } } })
      .connection.form.sslHelp;
    expect(help["definitelyNotAVariant"]).toBeUndefined();
  });

  it("keeps both locales on the same set of variants", () => {
    const keys = (bundle: Record<string, unknown>) =>
      Object.keys(
        (bundle as { connection: { form: { sslHelp: Record<string, string> } } }).connection.form
          .sslHelp,
      ).sort();
    expect(keys(vi)).toEqual(keys(en));
  });
});
