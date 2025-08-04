# MeteorS3 - Simply use S3 in your meteor 3 app

We want to make the useage of aws s3 as simple as possible in your Meteor 3 app. Just initialize one or more instances of the MeteorS3 client and you are ready to upload / download your files.

## Use cases

- Host public files in your app via s3, not via your server (saves you quite some resources)
- Allow your users to upload and download their own files in a safe way; this packages uses presigned urls only, so there'll be no load on your server at all for serving files.

## Features (MVP)

- Almost zero config use of S3
- Auto-create and setup your buckets
- Easily request presigned upload and download urls for your files
- Auto-setup Amazon event bridge to log the state of uploaded files
- Secure uploads, download and removal of files via the `onCheckPermissions` hook for each instance individually
- Use `onBeforeUpload` and `onAfterUpload` hooks to add your custom processing logic

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
```

_By default, the `onCheckPermissions` hook allows all operations on files._

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
    }
  ]
}
```
