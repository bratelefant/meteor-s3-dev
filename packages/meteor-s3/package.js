Package.describe({
  name: "bratelefant:meteor-s3",
  version: "0.0.1",
  // Brief, one-line summary of the package.
  summary: "Easy integration with Amazon S3 for Meteor applications.",
  // URL to the Git repository containing the source code for this package.
  git: "",
  // By default, Meteor will default to using README.md for documentation.
  // To avoid submitting documentation, set this field to null.
  documentation: "README.md",
});

Npm.depends({
  "@aws-sdk/client-s3": "3.859.0",
  "@aws-sdk/client-lambda": "3.859.0",
  "@aws-sdk/client-iam": "3.859.0",
  "@aws-sdk/s3-request-presigner": "3.859.0",
  axios: "1.11.0",
  "body-parser": "2.2.0",
});

Package.onUse(function (api) {
  api.versionsFrom("3.0");
  api.use("ecmascript");
  api.use("mongo");
  api.use("accounts-base");
  api.use("aldeed:collection2@4.1.4");
  api.mainModule("server.js", "server");
  api.mainModule("common.js");
  api.addAssets(
    [
      "private/lambda/uploadHandler/src.zip",
      "private/lambda/uploadHandler/manifest.tpl.json",
    ],
    "server"
  );
});

Package.onTest(function (api) {
  api.use("ecmascript");
  api.use("tinytest");
  api.use("bratelefant:meteor-s3");

  api.mainModule("meteor-s3-tests.js");
});
