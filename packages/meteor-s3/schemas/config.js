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
    autoValue: () => "eu-central-1", // Default region
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
  /**
   * Check permissions prior to upload, download or file removal.
   * If action is "upload", fileDoc will only be { filename, size, mimeType, meta }, since the checks
   * are performed before the file is inserted in the files collection.
   *
   * Signature is (fileDoc, action, userId, context) => boolean.
   *
   * Permission for actions "upload", "download" and "remove" is only granted, if this returns true and throws no errors.
   * By default, all checks will not pass.
   */
  onCheckPermissions: {
    type: Function,
    label: "Custom permission check function.",
    optional: true,
  },
  /**
   * Sets the key for the file in aws.
   *
   * Signature is ({ filename, size, mimeType, meta }, userId, context) => string.
   *
   * However, all uploads will have the prefix "uploads/" in any case.
   * By default, the key is generated using a unique identifier and the filename:
   * ```js
   * ${Random.id()}-${fileInfos.filename}
   * ```.
   */
  onGetKey: {
    type: Function,
    label: "Custom key generation function.",
    optional: true,
  },
  endpoint: {
    type: String,
    label: "S3 Endpoint URL",
    optional: true, // If omitted we use the default S3 endpoint; in testing we use a local MinIO instance
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
