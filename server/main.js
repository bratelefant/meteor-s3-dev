import { Meteor } from "meteor/meteor";
import { onPageLoad } from "meteor/server-render";
import { MeteorS3 } from "meteor/bratelefant:meteor-s3/server";
import { MeteorS3Client } from "meteor/bratelefant:meteor-s3/common";

const s3 = new MeteorS3({
  accessKeyId:
    process.env.AWS_ACCESS_KEY_ID || Meteor.settings?.aws?.accessKeyId,
  secretAccessKey:
    process.env.AWS_SECRET_ACCESS_KEY || Meteor.settings?.aws?.secretAccessKey,
  name: "publicFiles",
  region: "eu-central-1", // Optional, this defaults to 'eu-central-1'
  verbose: true, // Optional, this defaults to false
  skipPermissionChecks: false, // Optional, this defaults to false
  uploadExpiresIn: 60, // Optional, sets the expiration time for the presigned put urls; this defaults to 60 seconds
  downloadExpiresIn: 60, // Optional, sets the expiration time for the presigned get urls; this defaults to 60 seconds
  onCheckPermissions: async (fileDoc, action, userId, context) => {
    // Default permission check logic
    console.log(
      `Checking permissions for action: ${action} on file: ${fileDoc.name} by user: ${userId}`,
      "Context:",
      context
    );
    return true; // Allow all actions by default
  },
});

Meteor.startup(async () => {
  // Initialize the S3 client
  await s3.init();

  // Test the S3 client by uploading a test file
  const s3Client = new MeteorS3Client("publicFiles");

  let fileId;
  // Test the S3 client by uploading a test file
  try {
    const testFile = new File(["Hello World"], "test.txt", {
      type: "text/plain",
    });
    fileId = await s3Client.uploadFile(testFile, { test: true }, (progress) => {
      console.log(`Upload progress: ${progress}%`);
    });
    console.log(`Test file uploaded successfully with ID: ${fileId}`);
  } catch (error) {
    console.error("Error uploading test file:", error);
  }

  // Download the file to verify the upload
  try {
    const blob = await s3Client.downloadFile(fileId);
    console.log(
      `Test file downloaded successfully: ${blob.size} bytes, contents:`,
      blob
    );
  } catch (error) {
    console.error("Error downloading test file:", error);
  }
});

onPageLoad((sink) => {
  // Code to run on every request.
  sink.renderIntoElementById(
    "server-render-target",
    `Server time: ${new Date()}`
  );
});
