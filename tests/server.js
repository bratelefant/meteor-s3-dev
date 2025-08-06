import { expect } from "chai";
import sinon from "sinon";
import { MeteorS3 } from "meteor/bratelefant:meteor-s3/server";
import { S3Client } from "@aws-sdk/client-s3";
import { resetDb } from "./tools";

describe("Test MeteorS3 class", function () {
  describe("constructor", function () {
    it("should throw an error if config is not provided", function () {
      expect(() => new MeteorS3()).to.throw();
    });

    it("constructor with minimal valid config", function () {
      const config = {
        name: "testBucket",
        accessKeyId: "testAccessKey",
        secretAccessKey: "testSecretKey",
      };
      const s3 = new MeteorS3(config);
      expect(s3.config).to.deep.equal(config);
    });
  });

  describe("initialize", function () {
    beforeEach(async function () {
      await resetDb(); // Reset the database before each test

      // Mock S3Client to avoid actual AWS calls
      sinon.stub(S3Client.prototype, "send").callsFake(() => {
        return Promise.resolve({}); // Mock response
      });
    });

    afterEach(function () {
      sinon.restore(); // Restore original S3Client methods
    });

    it("should initialize the S3 client with valid config", async function () {
      const config = {
        name: "testBucket2",
        accessKeyId: "testAccessKey",
        secretAccessKey: "testSecretKey",
        endpoint: "http://localhost:9000",
        region: "us-east-1",
      };
      const s3 = new MeteorS3(config);
      sinon.stub(s3, "ensureBucket").resolves(); // Mock ensureBucket method
      sinon.stub(s3, "ensureMethods").resolves(); // Mock ensureMethods method
      sinon.stub(s3, "ensureCors").resolves(); // Mock ensureCors method

      await s3.init();

      expect(s3.ensureBucket.calledOnce).to.be.true;
      expect(s3.ensureMethods.calledOnce).to.be.true;
      expect(s3.ensureCors.calledOnce).to.be.false; // no cors if endpoint contains "localhost"
      expect(s3.config.name).to.equal("testBucket2");
      expect(s3.config.endpoint).to.equal("http://localhost:9000");
      expect(s3.config.region).to.equal("us-east-1");
    });
  });

  describe("generateValidBucketName", function () {
    it("should generate a valid bucket name", function () {
      const instanceName = "Test Bucket 123";
      const bucketName = MeteorS3.generateValidBucketName(instanceName);
      expect(bucketName).to.match(/^[a-z0-9-]{1,63}$/);
      expect(bucketName).to.include("test-bucket-");
    });

    it("removes invalid characters", function () {
      const invalidNames = [
        "",
        "Invalid Name!",
        "12345678901234567890123456789012345678901234567890123456789012345678901234567890",
      ];
      invalidNames.forEach((name) => {
        const bucketName = MeteorS3.generateValidBucketName(name);
        expect(bucketName).to.match(/^[a-z0-9-]{1,63}$/);
      });
    });
  });
});
