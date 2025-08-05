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
