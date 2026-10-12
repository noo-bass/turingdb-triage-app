// Signing stays out of the repo: app.json has a placeholder bundle id and no
// team. To build for a phone, set them for the build:
//   APPLE_TEAM_ID=XXXXXXXXXX BUNDLE_ID=com.you.triage npx expo run:ios --device
module.exports = ({ config }) => {
  const bundleId = process.env.BUNDLE_ID;
  return {
    ...config,
    ios: {
      ...config.ios,
      ...(bundleId && { bundleIdentifier: bundleId }),
      ...(process.env.APPLE_TEAM_ID && { appleTeamId: process.env.APPLE_TEAM_ID }),
    },
    android: { ...config.android, ...(bundleId && { package: bundleId }) },
  };
};
