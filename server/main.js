import { Meteor } from "meteor/meteor";
import { onPageLoad } from "meteor/server-render";
import { MeteorS3 } from "meteor/bratelefant:meteor-s3/server";
import { MeteorS3Client } from "meteor/bratelefant:meteor-s3/common";
import { Random } from "meteor/random";

const s3 = new MeteorS3({
  accessKeyId:
    process.env.AWS_ACCESS_KEY_ID || Meteor.settings?.aws?.accessKeyId,
  secretAccessKey:
    process.env.AWS_SECRET_ACCESS_KEY || Meteor.settings?.aws?.secretAccessKey,
  name: "publicFiles",

  endpoint: "http://localhost:4566", // Optional, this defaults to the AWS S3 endpoint
  region: "eu-central-1", // Optional, this defaults to 'eu-central-1'
  verbose: true, // Optional, this defaults to false
  skipPermissionChecks: false, // Optional, this defaults to false
  uploadExpiresIn: 60, // Optional, sets the expiration time for the presigned put urls; this defaults to 60 seconds
  downloadExpiresIn: 60, // Optional, sets the expiration time for the presigned get urls; this defaults to 60 seconds
  onCheckPermissions: async (_fileDoc, _action, _userId, _context) => {
    return true; // Allow all actions by default
  },
  /**
   * Demonstrate basic usage of onGetKey Hook for getting the keys for S3 uploads.
   * You can also use this to upload users files to corresponding userId-named folders
   * in S3 for example.
   *
   * @param {*} fileInfos
   * @param {*} _userId
   * @param {*} _context
   * @returns
   */
  onGetKey: (fileInfos, _userId, _context) => {
    // Custom key generation logic
    const { filename, mimeType, meta } = fileInfos; // also contains "size"
    if (mimeType.includes("image")) {
      return `images/${Random.id()}-${filename}`;
    }
    if (meta.path) {
      return `${meta.path}/${Random.id()}-${filename}`;
    }
    return `${Random.id()}-${filename}`;
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
    fileId = await s3Client.uploadFile(
      testFile,
      { path: "testpath", test: true },
      (progress) => {
        // eslint-disable-next-line no-console
        console.log(`Upload progress: ${progress}%`);
      }
    );
    // eslint-disable-next-line no-console
    console.log(`Test file uploaded successfully with ID: ${fileId}`);
  } catch (error) {
    console.error("Error uploading test file:", error);
  }

  // Download the file to verify the upload
  try {
    const blob = await s3Client.downloadFile(fileId);
    // eslint-disable-next-line no-console
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
