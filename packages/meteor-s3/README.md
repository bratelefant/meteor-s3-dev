# MeteorS3 - Simply use S3 in your meteor 3 app

We want to make the useage of aws s3 as simple as possible in your Meteor 3 app. Just initialize one or more instances of the MeteorS3 client and you are ready to upload / download your files.

## Use cases

- Host public files in your app via s3, not via your server (saves you quite some resources)
- Allow your users to upload and download their own files in a safe way; this packages uses presigned urls only, so there'll be no load on your server at all for serving files.

## Features (MVP)

- Minimal config use of S3
- Auto-create and setup your buckets
- Easily upload and download files to/from s3
- Auto-setup Lambda function to log the state of uploaded files
- Secure uploads, download and removal of files via the `onCheckPermissions` hook for each instance individually
- Use `onBeforeUpload` and `onAfterUpload` hooks to add your custom processing logic
- Use `onGetKey` hook to implement a custom organization of the files in your bucket
- Fully local test env to check functionality and AWS communication using free version of [LocalStack](https://github.com/localstack/localstack)

## Planned features

- Auto-setup lambda function to create thumbnails
- Auto-setup lambda function and meteor methods to zip files directly in the bucket

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
const fileId = await s3Client.uploadFile({
  file: testFile,
  meta: { test: true },
  onProgress: (progress) => {
    console.log(`Upload progress: ${progress}%`);
  },
});

// Download a file
const blob = await s3Client.downloadFile({ fileId });
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
      "Action": [
        "s3:CreateBucket",
        "s3:ListBucket",
        "s3:GetBucketLocation",
        "s3:PutBucketCors",
        "s3:GetBucketCors"
      ],
      "Resource": "arn:aws:s3:::meteor-s3-*"
    },
    {
      "Sid": "S3BucketNotifications",
      "Effect": "Allow",
      "Action": ["s3:GetBucketNotification", "s3:PutBucketNotification"],
      "Resource": ["arn:aws:s3:::meteor-s3-*"]
    },
    {
      "Sid": "AllowS3ObjectOperations",
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::meteor-s3-*/*"
    },
    {
      "Sid": "LambdaListGlobal",
      "Effect": "Allow",
      "Action": ["lambda:ListFunctions"],
      "Resource": "*"
    },
    {
      "Sid": "LambdaBasicMgmtScoped",
      "Effect": "Allow",
      "Action": [
        "lambda:CreateFunction",
        "lambda:GetFunction",
        "lambda:UpdateFunctionCode",
        "lambda:UpdateFunctionConfiguration",
        "lambda:GetPolicy",
        "lambda:AddPermission",
        "lambda:RemovePermission"
      ],
      "Resource": "arn:aws:lambda:*:*:function:meteorS3-*"
    },
    {
      "Sid": "ReadOrCreateExecRole",
      "Effect": "Allow",
      "Action": ["iam:GetRole", "iam:CreateRole", "iam:UpdateAssumeRolePolicy"],
      "Resource": "arn:aws:iam::*:role/MeteorS3LambdaExecRole-*"
    },
    {
      "Sid": "AttachLogsManagedPolicy",
      "Effect": "Allow",
      "Action": ["iam:AttachRolePolicy"],
      "Resource": "arn:aws:iam::*:role/MeteorS3LambdaExecRole-*",
      "Condition": {
        "StringEquals": {
          "iam:PolicyArn": "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
        }
      }
    },
    {
      "Sid": "PutInlineS3Policy",
      "Effect": "Allow",
      "Action": ["iam:PutRolePolicy", "iam:GetRolePolicy"],
      "Resource": "arn:aws:iam::*:role/MeteorS3LambdaExecRole-*"
    },
    {
      "Sid": "PassExecRoleToLambda",
      "Effect": "Allow",
      "Action": "iam:PassRole",
      "Resource": "arn:aws:iam::*:role/MeteorS3LambdaExecRole-*"
    }
  ]
}
```

### Checking permissions

MeteorS3 allows you to define custom permission checks for each instance individually using the `onCheckPermissions` hook. This hook is called before any file operation (upload, download, remove) and receives the file document, the action being performed, the current user ID, and the context object as parameters. You can use this hook to implement fine-grained access control based on your application's requirements.

The `context` object can contain any data you need for your permission checks, such as a JWT token for example.

**Important:** The context is created on the client side. So this is no data to be trusted. You should always validate the context on the server side in your `onCheckPermissions` hook.

Example of a custom permission check, which allows only the owner of a file to download it:

```js
// if action is "upload", the fileDoc will only be { filename, size, mimeType, meta } that are sent from the client
s3.onCheckPermissions = (fileDoc, action, userId, context) => {
  if (action === "download") {
    // Allow download only if the userId in context matches the file's owner;
    return userId === fileDoc.ownerId;
  }
  return false; // Deny other actions by default
};
```

## Examples

### Profile Pictures

On the server side, so something like this.

```js
import { MeteorS3 } from "meteor/bratelefant:meteor-s3/server";

export const s3UserFiles = new MeteorS3({
  accessKeyId: "test",
  secretAccessKey: "test",
  name: "profilePictures",
  onCheckPermissions: (fileDoc, action, userId, context) => {
    if (action === "upload") {
      // Allow upload if the user is logged in
      return !!userId;
    } else if (action === "download" || action === "remove") {
      // Allow download and remove if the user is logged in and the file belongs to them
      return !!userId && fileDoc.ownerId === userId;
    }
    return false; // Default to no permission
  },
  onGetKey: (fileInfos, userId) => {
    // Store files in the bucket in a subfolder for each userId
    return `users/${userId}/${Random.id(16)}_${fileInfos.filename}`;
  },
  onAfterUpload: async (fileDoc) => {
    // After the upload has finished and after the lambda function has reported
    // the s3 status to be "uploaded", set the users profile picture
    await Meteor.users.updateAsync(fileDoc.ownerId, {
      $set: {
        "profile.pictureFileId": fileDoc._id,
      },
    });
  },
});

Meteor.startup(() => {
  s3UserFiles.init();
});
```

On the client (browser) you can manage the upload and download of the profile picture like so (this is react):

```js
import React, { useEffect, useState } from "react";
import { MeteorS3Client } from "meteor/bratelefant:meteor-s3/common";

export const ProfilePicture = () => {
  // Init MeteorS3 client with exactly the same name as the server instance
  const s3 = new MeteorS3Client("profilePictures");

  const [profileUrl, setProfileUrl] = useState();
  const [avatarLoading, setAvatarLoading] = useState(false);

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    // upload the file, thats all you have to do
    await s3.uploadFile({
      file,
      onProgress: (progress) => {
        console.log("Uploading...", progress);
      },
    });
  };

  useEffect(() => {
    (async () => {
      /*
       * The `onAfterUpload` hook on the server side will make sure,
       * that the `profile.pictureFileId` is set, as soon as the file
       * is reported to be uploaded to s3.
       * Since `Meteor.user()?.profile` is reactive, the ui will update
       * automatically after the upload has finished
       */
      if (Meteor.user()?.profile?.pictureFileId) {
        setAvatarLoading(true);
        setProfileUrl(
          await s3.getDownloadUrl({
            fileId: Meteor.user().profile.pictureFileId,
          })
        );
        setAvatarLoading(false);
      }
    })();
  }, [Meteor.user()?.profile?.pictureFileId]);

  return (
    <div>
      <div>
        {avatarLoading ? (
          <div>Loading...</div>
        ) : (
          <img
            style={{ maxWidth: 120, maxHeight: 120 }}
            src={profileUrl}
            alt="Profile Picture"
          />
        )}
      </div>
      <div>
        <input onChange={handleFileUpload} type="file"></input>
      </div>
    </div>
  );
};
```
