import SimpleSchema from "meteor/aldeed:simple-schema";

export const ImageMetaSchema = new SimpleSchema({
  width: Number,
  height: Number,
});

export const VariantSchema = new SimpleSchema({
  name: String, // eg thumbnail-medium or tn-300x300
  type: {
    type: String,
    allowedValues: ["thumbnail"],
    defaultValue: "thumbnail",
  },
  meta: ImageMetaSchema,
  key: String,
  etag: { type: String, optional: true },
});

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
  variants: { type: Array, optional: true },
  "variants.$": VariantSchema,
});
