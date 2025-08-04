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
    label: "Unique S3 Instance Name",
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
