import { expect } from "chai";
import sinon from "sinon";
import { MeteorS3 } from "meteor/bratelefant:meteor-s3/server";
import { resetDb } from "./tools";
import { Random } from "meteor/random";

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
      expect(s3.config).to.deep.include(config);
    });
  });

  describe("initialize", function () {
    beforeEach(async function () {
      await resetDb(); // Reset the database before each test
    });

    afterEach(function () {
      sinon.restore(); // Restore any stubs
    });

    it("should initialize the S3 client with valid config", async function () {
      const config = {
        name: "testBucket2",
        accessKeyId: "testAccessKey",
        secretAccessKey: "testSecretKey",
        endpoint: "http://localhost:4566", // Use localstack instance
      };
      const s3 = new MeteorS3(config);
      sinon.spy(s3, "ensureBucket");
      sinon.spy(s3, "ensureMethods");
      sinon.spy(s3, "ensureCors");

      await s3.init();

      expect(s3.ensureBucket.calledOnce).to.be.true;
      expect(s3.ensureMethods.calledOnce).to.be.true;
      expect(s3.ensureCors.calledOnce).to.be.true;
      expect(s3.config.name).to.equal("testBucket2");
      expect(s3.config.endpoint).to.equal("http://localhost:4566");
    });

    it("should initialize and create s3Client instance", async function () {
      const config = {
        name: "testBucket5",
        accessKeyId: "testAccessKey",
        secretAccessKey: "testSecretKey",
        endpoint: "http://localhost:4566",
      };

      const s3 = new MeteorS3(config);

      await s3.init();

      // Verify that s3Client was created
      expect(s3.s3Client).to.exist;
      expect(s3.s3Client.send).to.be.a("function");
    });
  });

  describe("ensureBucket", function () {
    let s3;

    beforeEach(async function () {
      await resetDb(); // Reset the database before each test

      const config = {
        name: "testBucket4",
        accessKeyId: "testAccessKey",
        secretAccessKey: "testSecretKey",
        endpoint: "http://localhost:4566", // Use localstack instance
      };
      s3 = new MeteorS3(config);

      await s3.init(); // Initialize the S3 instance
    });

    afterEach(function () {
      sinon.restore(); // Restore original methods
    });

    it("should create a new bucket if it does not exist", async function () {
      const bucketName = "test-bucket-12345";
      s3.config.name = bucketName;

      sinon.stub(s3.buckets, "findOneAsync").resolves(null); // Mock no existing bucket
      sinon.stub(s3.buckets, "insertAsync").resolves(); // Mock insert operation
      sinon.spy(s3.s3Client, "send");

      await s3.ensureBucket();

      // Check that bucket name follows the expected pattern (includes the original name and a random suffix)
      expect(s3.bucketName).to.match(
        /^meteor-s3-test-bucket-12345-[a-z0-9]{6}$/
      );
      expect(s3.buckets.insertAsync.calledOnce).to.be.true;
      expect(s3.s3Client.send.called).to.be.true;
    });
  });

  describe("ensureMethods", function () {
    let s3;

    beforeEach(async function () {
      await resetDb(); // Reset the database before each test

      const config = {
        name: "testBucket6",
        accessKeyId: "testAccessKey",
        secretAccessKey: "testSecretKey",
        endpoint: "http://localhost:4566", // Use localstack instance
      };
      s3 = new MeteorS3(config);

      await s3.init(); // Initialize the S3 instance
    });

    afterEach(function () {
      sinon.restore(); // Restore original methods
    });

    it("should register S3 methods in Meteor", async function () {
      const registerStub = sinon.stub(Meteor, "methods");

      await s3.ensureMethods();

      expect(registerStub.calledOnce).to.be.true;
      expect(Object.keys(registerStub.firstCall.args[0])).to.include(
        "meteorS3." + s3.config.name + ".getUploadUrl"
      );
      expect(Object.keys(registerStub.firstCall.args[0])).to.include(
        "meteorS3." + s3.config.name + ".getDownloadUrl"
      );
      expect(Object.keys(registerStub.firstCall.args[0])).to.include(
        "meteorS3." + s3.config.name + ".handleFileUploadEvent"
      );
      expect(Object.keys(registerStub.firstCall.args[0])).to.include(
        "meteorS3." + s3.config.name + ".removeFile"
      );
    });
  });

  describe("getUploadUrl", function () {
    let s3;
    beforeEach(async function () {
      await resetDb(); // Reset the database before each test

      const config = {
        name: "testBucket7",
        accessKeyId: "testAccessKey",
        secretAccessKey: "testSecretKey",
        endpoint: "http://localhost:4566", // Use localstack instance
        onCheckPermissions: () => true,
        skipPermissionChecks: true,
      };

      s3 = new MeteorS3(config);

      await s3.init(); // Initialize the S3 instance

      s3.bucketName = "test-bucket-name";
    });

    afterEach(function () {
      sinon.restore(); // Restore original methods
    });

    it("should return a valid upload URL for a file", async function () {
      const file = {
        name: "testFile.txt",
        type: "text/plain",
        size: 1024,
      };
      const fileId = "testFileId";

      // Mock files collection
      sinon.stub(s3.files, "insertAsync").resolves(fileId);

      const result = await s3.getUploadUrl(file);
      expect(result).to.be.an("object");
      expect(result).to.have.property("url");
      expect(result).to.have.property("fileId");
      expect(result.url).to.include("testFile.txt");
      expect(s3.files.insertAsync.calledOnce).to.be.true;
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
        expect(bucketName).to.match(/^[a-z0-9-]{6,63}$/);
      });
    });
  });

  describe("getUploadUrl", function () {
    let s3;

    beforeEach(async function () {
      await resetDb(); // Reset the database before each test

      const config = {
        name: "testBucket" + Random.id(5),
        accessKeyId: "testAccessKey",
        secretAccessKey: "testSecretKey",
        endpoint: "http://localhost:4566", // Use localstack instance
        uploadExpiresIn: 3600,
        skipPermissionChecks: true, // Skip permission checks for testing
      };
      s3 = new MeteorS3(config);

      await s3.init(); // Initialize the S3 instance

      // Set a test bucket name
      s3.bucketName = "test-bucket-name";
    });

    afterEach(function () {
      sinon.restore(); // Restore all stubs
    });

    it("should create file document with correct properties", async function () {
      const uploadParams = {
        name: "test-file.jpg",
        size: 1024,
        type: "image/jpeg",
        meta: { description: "Test file" },
        userId: "testUser123",
        context: {},
      };

      // Mock the files collection
      const insertStub = sinon
        .stub(s3.files, "insertAsync")
        .resolves("file123");

      const result = await s3.getUploadUrl(uploadParams);

      // Verify the result
      expect(result).to.have.property("url");
      expect(result).to.have.property("fileId");
      expect(result.url).to.include("test-file.jpg");
      expect(result.fileId).to.equal("file123");

      // Verify file document was created
      expect(insertStub.calledOnce).to.be.true;
      const fileDoc = insertStub.firstCall.args[0];
      expect(fileDoc.filename).to.equal("test-file.jpg");
      expect(fileDoc.size).to.equal(1024);
      expect(fileDoc.mimeType).to.equal("image/jpeg");
      expect(fileDoc.bucket).to.equal("test-bucket-name");
      expect(fileDoc.meta.description).to.equal("Test file");
    });

    it("should handle permission denial", async function () {
      // Disable permission skip for this test
      s3.config.skipPermissionChecks = false;

      const uploadParams = {
        name: "test-file.txt",
        size: 512,
        type: "text/plain",
        meta: {},
        userId: "testUser789",
        context: {},
      };

      // Mock permission check to deny access
      sinon.stub(s3, "handlePermissionsCheck").resolves(false);

      try {
        await s3.getUploadUrl(uploadParams);
        expect.fail("Should have thrown permission error");
      } catch (error) {
        expect(error.error).to.equal("s3-permission-denied");
        expect(s3.handlePermissionsCheck.calledOnce).to.be.true;
      }
    });

    it("should set correct file status in development vs production", async function () {
      const uploadParams = {
        name: "status-test.pdf",
        size: 2048,
        type: "application/pdf",
        meta: {},
        userId: "testUser456",
        context: {},
      };

      const insertStub = sinon
        .stub(s3.files, "insertAsync")
        .resolves("file456");

      // Test uses the mocked version, but we can verify the status logic
      await s3.getUploadUrl(uploadParams);

      const fileDoc = insertStub.firstCall.args[0];
      // In development (which Meteor.isDevelopment returns true), status should be "uploaded"
      expect(fileDoc.status).to.equal(
        Meteor.isDevelopment ? "uploaded" : "pending"
      );
    });

    it("should include metadata in file document", async function () {
      const uploadParams = {
        name: "meta-test.jpg",
        size: 1024,
        type: "image/jpeg",
        meta: {
          category: "profile",
          tags: ["important", "user-generated"],
          author: "testUser",
        },
        userId: "testUser123",
        context: {},
      };

      const insertStub = sinon
        .stub(s3.files, "insertAsync")
        .resolves("file123");

      await s3.getUploadUrl(uploadParams);

      const fileDoc = insertStub.firstCall.args[0];
      expect(fileDoc.meta).to.deep.equal({
        category: "profile",
        tags: ["important", "user-generated"],
        author: "testUser",
      });
    });
  });
});
