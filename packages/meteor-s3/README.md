# MeteorS3 - Simply use S3 in your meteor 3 app

We want to make the useage of aws s3 as simple as possible in your Meteor 3 app. Just initialize one or more instances of the MeteorS3 client and you are ready to upload / download your files.

## Use cases

- Host public files in your app via s3, not via your server (saves you quite some resources)
- Allow your users to upload and download their own files in a safe way; this packages uses presigned urls only, so there'll be no load on your server at all for serving files.

## Features (MVP)

- Minimal config use of S3
- Auto-create and setup your buckets
- Easily upload and download files to/from s3
- Auto-setup Amazon event bridge to log the state of uploaded files
- Secure uploads, download and removal of files via the `onCheckPermissions` hook for each instance individually
- Use `onBeforeUpload` and `onAfterUpload` hooks to add your custom processing logic

## Planned features

- Auto-setup S3 event trigger to call post-upload handler on the server
- Auto-setup lambda function to create thumbnails

## Setup

You only need a few steps to get everything going:

- Setup a fresh IAM user with some privileges on managing s3 buckets (cf. below)
- Your IAM users `accessKeyId`
- Your IAM users `secretAccessKey`

Then just do a

```js
const publicS3 = new MeteorS3({
  name: "public-files",
  accessKeyId: Meteor.settings.accessKeyId,
  secretAccessKey: Meteor.settings.secretAccessKey,
});

await publicS3.init();
```

_By default, the `onCheckPermissions` hook allows all operations on files._

Now your server is ready. If you want to upload/download files, you can use the MeteorS3Client helper class to do that:

```js
// This runs on the server or the client

// Create a client for the publicFiles Instance of MeteorS3
const s3Client = new MeteorS3Client("publicFiles");

const testFile = new File(["Hello World"], "test.txt", {
  type: "text/plain",
});

// Uplaod a file with metadata and log the progress
const fileId = await s3Client.uploadFile(
  testFile,
  { test: true },
  (progress) => {
    console.log(`Upload progress: ${progress}%`);
  }
);

// Download a file
const blob = await s3Client.downloadFile(fileId);
```

### Required policy

Your IAM user needs to be able to perform some operations on your s3 buckets. Here's the example config.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowS3BucketManagement",
      "Effect": "Allow",
      "Action": ["s3:CreateBucket", "s3:ListBucket", "s3:GetBucketLocation"],
      "Resource": "arn:aws:s3:::*"
    },
    {
      "Sid": "AllowS3ObjectOperations",
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::*/*"
    },
    {
      "Sid": "AllowS3CorsOperations",
      "Effect": "Allow",
      "Action": ["s3:GetBucketCors", "s3:PutBucketCors"],
      "Resource": "arn:aws:s3:::*"
    }
  ]
}
```
