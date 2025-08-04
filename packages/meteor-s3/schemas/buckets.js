import SimpleSchema from "meteor/aldeed:simple-schema";

export const MeteorS3BucketsSchema = new SimpleSchema({
  instanceName: {
    type: String,
    label: "Name of the MeteorS3 instance this bucket belongs to",
  },
  bucketName: {
    type: String,
    label: "Actual name of the S3 bucket",
  },
  region: {
    type: String,
    label: "Region of the bucket, e.g. 'eu-central-1'",
  },
  createdAt: {
    type: Date,
    label: "Creation (or registration) date of the bucket",
    optional: true,
  },
});
