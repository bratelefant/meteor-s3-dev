import SimpleSchema from "meteor/aldeed:simple-schema";

export const configSchema = new SimpleSchema({
  accessKeyId: {
    type: String,
    label: "AWS Access Key ID",
    optional: false,
  },
  secretAccessKey: {
    type: String,
    label: "AWS Secret Access Key",
    optional: false,
  },
  name: {
    type: String,
    label: "Unique MeteorS3 Instance Name",
    optional: false,
  },
  region: {
    type: String,
    label: "AWS Region",
    optional: true,
    defaultValue: "eu-central-1",
  },
  verbose: {
    type: Boolean,
    label: "Enable verbose logging",
    optional: true,
    defaultValue: false,
  },
  skipPermissionChecks: {
    type: Boolean,
    label: "Skip permission checks when called from the server",
    optional: true,
    defaultValue: false,
  },
  uploadExpiresIn: {
    type: Number,
    label: "Expiration time for upload URLs in seconds",
    optional: true,
    defaultValue: 60, // Default to 60 seconds
  },
  downloadExpiresIn: {
    type: Number,
    label: "Expiration time for download URLs in seconds",
    optional: true,
    defaultValue: 60, // Default to 60 seconds
  },
  onCheckPermissions: {
    type: Function,
    label: "Custom permission check function",
    defaultValue: async (fileDoc, action, userId, context) => {
      console.info(
        `Predefined onCheckPermissions denied by default. Set "onCheckPermissions(fileDoc, action, userId, context)" in the config to implement your own permission logic. 
        You can also set \`skipPermissionChecks: true\` in the config to skip all permission checks on the server side.`
      );
      return false; // Default to a function that always returns false
    },
  },
});

export const clientConfigSchema = new SimpleSchema({
  name: {
    type: String,
    label: "Unique MeteorS3 Instance Name",
    optional: false,
  },
  verbose: {
    type: Boolean,
    label: "Enable verbose logging",
    optional: true,
    defaultValue: false,
  },
});
