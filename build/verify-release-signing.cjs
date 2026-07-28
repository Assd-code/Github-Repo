const hasSigningIdentity = Boolean(process.env.CSC_LINK || process.env.CSC_NAME);
const hasAppleId = Boolean(
  process.env.APPLE_ID &&
  process.env.APPLE_APP_SPECIFIC_PASSWORD &&
  process.env.APPLE_TEAM_ID
);
const hasApiKey = Boolean(
  process.env.APPLE_API_KEY &&
  process.env.APPLE_API_KEY_ID &&
  process.env.APPLE_API_ISSUER
);
const hasKeychainProfile = Boolean(process.env.APPLE_KEYCHAIN && process.env.APPLE_KEYCHAIN_PROFILE);

if (!hasSigningIdentity || (!hasAppleId && !hasApiKey && !hasKeychainProfile)) {
  console.error(
    "Release signing is not configured. Provide a Developer ID identity and Apple notarization credentials before distributing VaR Lab.",
  );
  process.exit(1);
}
