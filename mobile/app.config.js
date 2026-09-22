const fs = require("node:fs");
const path = require("node:path");

module.exports = ({ config }) => {
  const localGoogleServicesFile = "./google-services.json";
  const googleServicesFile =
    process.env.GOOGLE_SERVICES_JSON ||
    (fs.existsSync(path.join(__dirname, "google-services.json"))
      ? localGoogleServicesFile
      : undefined);

  return {
    ...config,
    android: {
      ...config.android,
      ...(googleServicesFile ? { googleServicesFile } : {}),
    },
  };
};
