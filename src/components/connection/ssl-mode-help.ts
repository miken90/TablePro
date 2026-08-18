/**
 * Which sentence describes what an SSL mode actually does, per engine.
 *
 * The modes are named the same for every engine but do not behave the same,
 * so the connection form explains the selected one instead of leaving the user
 * to assume "Required" means "verified". Each mapping below mirrors what the
 * driver really does:
 *
 * - PostgreSQL (`driver-postgres`, native-tls): `disable` opens a plaintext
 *   connection; `prefer` and `require` accept invalid certificates and host
 *   names; `verify-ca` and `verify-full` both validate through the OS store.
 * - MySQL (`driver-mysql`, mysql_async + rustls): `disable` and `prefer` use
 *   no TLS at all; `require` encrypts without validating; `verify-ca`
 *   validates the chain only; `verify-full` validates chain and host name.
 *   Trust anchors are a bundled list of public CAs, not the OS store.
 * - SQL Server (`driver-mssql`, tiberius): encryption is always on — tiberius
 *   defaults to `EncryptionLevel::Required` and the driver never lowers it —
 *   and every mode except `verify-full` calls `trust_cert()`.
 */
export type SslModeHelp =
  | "plaintext"
  | "encryptedUnverified"
  | "verifiedSystem"
  | "verifiedBundled"
  | "verifiedBundledChainOnly";

export function sslModeHelp(dbType: string, sslMode: string): SslModeHelp {
  if (dbType === "mssql") {
    return sslMode === "verify-full" ? "verifiedSystem" : "encryptedUnverified";
  }

  if (dbType === "mysql") {
    switch (sslMode) {
      case "require":
        return "encryptedUnverified";
      case "verify-ca":
        return "verifiedBundledChainOnly";
      case "verify-full":
        return "verifiedBundled";
      default:
        return "plaintext";
    }
  }

  // PostgreSQL and anything else that shows the selector.
  switch (sslMode) {
    case "prefer":
    case "require":
      return "encryptedUnverified";
    case "verify-ca":
    case "verify-full":
      return "verifiedSystem";
    default:
      return "plaintext";
  }
}

/** i18n key for the sentence shown under the SSL Mode selector. */
export function sslModeHelpKey(dbType: string, sslMode: string): string {
  return `connection.form.sslHelp.${sslModeHelp(dbType, sslMode)}`;
}
