const path = require("path");
const { execFileSync } = require("child_process");
const { flipFuses, FuseVersion, FuseV1Options } = require("@electron/fuses");

function plistBuddy(plistPath, command, optional = false) {
  try {
    execFileSync("/usr/libexec/PlistBuddy", ["-c", command, plistPath], { stdio: "ignore" });
  } catch (error) {
    if (!optional) throw error;
  }
}

module.exports = async function afterPack(context) {
  const executablePath = context.electronPlatformName === "darwin"
    ? path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
    : path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);

  await flipFuses(executablePath, {
    version: FuseVersion.V1,
    [FuseV1Options.RunAsNode]: false,
    // VaR Lab sets an in-memory session cookie with a fresh random token on
    // every launch. Enabling Chromium cookie encryption for this local,
    // ad-hoc-signed build causes a Keychain prompt after each app update while
    // adding no protection for a cookie that is never persisted.
    [FuseV1Options.EnableCookieEncryption]: false,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
    [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot]: false,
    [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
  });

  if (context.electronPlatformName !== "darwin") return;

  const plistPath = path.join(executablePath, "Contents", "Info.plist");
  for (const key of [
    "NSAudioCaptureUsageDescription",
    "NSBluetoothAlwaysUsageDescription",
    "NSBluetoothPeripheralUsageDescription",
    "NSCameraUsageDescription",
    "NSMicrophoneUsageDescription",
  ]) {
    plistBuddy(plistPath, `Delete :${key}`, true);
  }

  plistBuddy(plistPath, "Delete :NSAppTransportSecurity", true);
  plistBuddy(plistPath, "Add :NSAppTransportSecurity dict");
  plistBuddy(plistPath, "Add :NSAppTransportSecurity:NSAllowsArbitraryLoads bool false");
  plistBuddy(plistPath, "Add :NSAppTransportSecurity:NSAllowsLocalNetworking bool true");
  plistBuddy(plistPath, "Add :NSAppTransportSecurity:NSExceptionDomains dict");
  for (const host of ["127.0.0.1", "localhost"]) {
    plistBuddy(plistPath, `Add :NSAppTransportSecurity:NSExceptionDomains:${host} dict`);
    plistBuddy(plistPath, `Add :NSAppTransportSecurity:NSExceptionDomains:${host}:NSIncludesSubdomains bool false`);
    plistBuddy(plistPath, `Add :NSAppTransportSecurity:NSExceptionDomains:${host}:NSTemporaryExceptionAllowsInsecureHTTPLoads bool true`);
  }
  execFileSync("plutil", ["-lint", plistPath], { stdio: "inherit" });
};
