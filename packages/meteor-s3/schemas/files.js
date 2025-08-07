import SimpleSchema from "meteor/aldeed:simple-schema";

export const MeteorS3FilesSchema = new SimpleSchema({
  filename: String,
  size: Number,
  mimeType: {
    type: String,
    optional: true,
    defaultValue: "application/octet-stream",
  },
  key: String,
  bucket: String,
  etag: { type: String, optional: true },
  status: {
    type: String,
    allowedValues: ["pending", "uploading", "uploaded", "error"],
  },
  ownerId: { type: String, optional: true },
  createdAt: { type: Date },
  meta: { type: Object, blackbox: true, optional: true },
  // Additional fields can be added as needed
});
