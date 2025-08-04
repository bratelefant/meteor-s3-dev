import { Meteor } from "meteor/meteor";
import { onPageLoad } from "meteor/server-render";
import { MeteorS3 } from "meteor/bratelefant:meteor-s3/server";

const s3Client = new MeteorS3({
  accessKeyId:
    process.env.AWS_ACCESS_KEY_ID || Meteor.settings?.aws?.accessKeyId,
  secretAccessKey:
    process.env.AWS_SECRET_ACCESS_KEY || Meteor.settings?.aws?.secretAccessKey,
  name: "publicFiles",
  region: "eu-central-1",
  verbose: true, // Enable verbose logging
});

Meteor.startup(async () => {
  // Initialize the S3 client
  await s3Client.init();
  console.log("Meteor S3 package initialized successfully.");
});

onPageLoad((sink) => {
  // Code to run on every request.
  sink.renderIntoElementById(
    "server-render-target",
    `Server time: ${new Date()}`
  );
});
