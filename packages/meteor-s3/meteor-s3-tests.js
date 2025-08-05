// Import Tinytest from the tinytest Meteor package.
import { Tinytest } from "meteor/tinytest";

// Import and rename a variable exported by meteor-s3.js.
import { name as packageName } from "meteor/bratelefant:meteor-s3";

// Write your tests here!
// Here is an example.
Tinytest.add("meteor-s3 - example", function (test) {
  test.equal(packageName, "meteor-s3");
});
