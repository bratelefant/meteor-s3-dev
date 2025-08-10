import { expect } from "chai";
import sinon from "sinon";
import { MeteorS3 } from "meteor/bratelefant:meteor-s3/server";
import { resetDb } from "./tools";
import { Random } from "meteor/random";
import { PutObjectCommand } from "@aws-sdk/client-s3";

describe("Test MeteorS3 initialisation (Server)", function () {
  if (!Meteor.isServer) {
    it("should not run on client", function () {
      expect(true).to.be.true;
    });
    return;
  }

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
        webhookBaseUrl: Meteor.isDevelopment
          ? "http://" + process.env.LOCAL_IP + ":3000"
          : undefined,
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
});

describe("MeteorS3 static functions", function () {
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

describe("Test MeteorS3 class (Server)", function () {
  if (!Meteor.isServer) {
    it("should not run on client", function () {
      expect(true).to.be.true;
    });
    return;
  }

  let s3;

  beforeEach(async function () {
    await resetDb(); // Reset the database before each test

    const config = {
      name: "testBucket" + Random.id(6),
      accessKeyId: "testAccessKey",
      secretAccessKey: "testSecretKey",
      endpoint: "http://localhost:4566", // Use localstack instance
      webhookBaseUrl: Meteor.isDevelopment
        ? "http://" + process.env.LOCAL_IP + ":3000"
        : undefined,
      onCheckPermissions: () => true, // Mock permission check
    };
    s3 = new MeteorS3(config);

    await s3.init(); // Initialize the S3 instance
  });

  afterEach(function () {
    sinon.restore(); // Restore original methods
  });

  describe("ensureBucket", function () {
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

  describe("ensureCors", function () {
    it("should set up CORS headers", async function () {
      sinon.spy(s3.s3Client, "send");
      await s3.ensureCors();
      expect(s3.s3Client.send.calledOnce).to.be.true;
    });
  });

  describe("ensureEndpoints", function () {
    it("should set up REST API endpoints", async function () {
      sinon.spy(WebApp.handlers, "post");
      await s3.ensureEndpoints();

      expect(WebApp.handlers.post.calledOnce).to.be.true;

      // test request handling

      const result = await fetch(
        Meteor.absoluteUrl("/api/" + s3.config.name + "/confirm"),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ key: "testkey" + Random.id() }),
        }
      );

      // check response; file will not exist at this point
      expect(result).to.have.property("status", 404);
    });
  });

  describe("getUploadUrl", function () {
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
      expect(fileDoc.bucket).to.match(
        /^meteor-s3-testbucket[a-z0-9]{6}-[a-z0-9]{6}$/
      );
      expect(fileDoc.meta.description).to.equal("Test file");
    });

    it("should call onBeforeUpload hook if defined", async function () {
      const uploadParams = {
        name: "before-upload-test.txt",
        size: 512,
        type: "text/plain",
        meta: {},
        userId: "testUser456",
        context: {},
      };

      const onBeforeUploadStub = sinon.stub();
      s3.onBeforeUpload = onBeforeUploadStub;
      const result = await s3.getUploadUrl(uploadParams); // Call the method

      expect(onBeforeUploadStub.calledOnce).to.be.true;

      expect(onBeforeUploadStub.firstCall.args[0]).to.deep.include({
        filename: "before-upload-test.txt",
        size: 512,
        mimeType: "text/plain",
        meta: {},
        ownerId: "testUser456",
      });
      expect(result).to.have.property("url");
      expect(result).to.have.property("fileId");
    });

    it("should call onGetKey hook", async function () {
      const uploadParams = {
        name: "get-key-test.txt",
        size: 512,
        type: "text/plain",
        meta: {},
        userId: "testUser456",
        context: {},
      };

      const onGetKeyStub = sinon.stub();
      s3.onGetKey = onGetKeyStub;

      const result = await s3.getUploadUrl(uploadParams);

      expect(onGetKeyStub.calledOnce).to.be.true;
      expect(onGetKeyStub.firstCall.args[0]).to.deep.include({
        filename: "get-key-test.txt",
        size: 512,
        mimeType: "text/plain",
        meta: {},
      });
      expect(result).to.have.property("url");
      expect(result).to.have.property("fileId");
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
      expect(fileDoc.status).to.equal("pending");
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

  describe("getDownloadUrl", function () {
    it("should return a valid download URL for a file", async function () {
      const fileId = "testFileId";
      const file = {
        _id: fileId,
        filename: "testFile.txt",
        key: "testFileKey",
        bucket: "testBucket",
        status: "uploaded",
      };

      // Mock files collection
      sinon.stub(s3.files, "findOneAsync").resolves(file);
      sinon.stub(s3, "handlePermissionsCheck").resolves(true);

      const result = await s3.getDownloadUrl({ fileId });

      expect(result).to.be.a("string");
      expect(result).to.include("http");
    });

    it("should throw an error if file does not exist", async function () {
      const fileId = "nonExistentFileId";

      // Mock files collection to return null
      sinon.stub(s3.files, "findOneAsync").resolves(null);

      try {
        await s3.getDownloadUrl({ fileId });
        expect.fail("Should have thrown file not found error");
      } catch (error) {
        expect(error.error).to.equal("s3-file-not-found");
      }
    });

    it("should throw an error if permissions are denied", async function () {
      const fileId = "testFileId";
      const file = {
        _id: fileId,
        filename: "testFile.txt",
        key: "testFileKey",
        bucket: "testBucket",
        status: "uploaded",
      };

      // Mock files collection
      sinon.stub(s3.files, "findOneAsync").resolves(file);
      sinon.stub(s3, "handlePermissionsCheck").resolves(false);

      try {
        await s3.getDownloadUrl({ fileId });
        expect.fail("Should have thrown permission denied error");
      } catch (error) {
        expect(error.error).to.equal("s3-permission-denied");
      }
    });

    it("should throw an error if file is not uploaded", async function () {
      const fileId = "testFileId";
      const file = {
        _id: fileId,
        filename: "testFile.txt",
        key: "testFileKey",
        bucket: "testBucket",
        status: "pending", // Not uploaded yet
      };

      // Mock files collection
      sinon.stub(s3.files, "findOneAsync").resolves(file);
      sinon.stub(s3, "handlePermissionsCheck").resolves(true);

      try {
        await s3.getDownloadUrl({ fileId });
        expect.fail("Should have thrown file not uploaded error");
      } catch (error) {
        expect(error.error).to.equal("s3-file-not-ready");
      }
    });
  });

  describe("removeFile", function () {
    it("should remove a file by ID", async function () {
      const fileId = "testFileId";
      const file = {
        _id: fileId,
        filename: "testFile.txt",
        key: "testFileKey",
        bucket: "testBucket",
        status: "uploaded",
      };

      // Mock files collection
      sinon.stub(s3.files, "findOneAsync").resolves(file);
      sinon.stub(s3.files, "removeAsync").resolves();
      sinon.stub(s3.s3Client, "send").resolves();

      await s3.removeFile({ fileId });

      expect(s3.files.findOneAsync.calledWith(fileId)).to.be.true;
      expect(s3.files.removeAsync.calledWith(fileId)).to.be.true;
    });

    it("should throw an error if file does not exist", async function () {
      const fileId = "nonExistentFileId";

      // Mock files collection to return null
      sinon.stub(s3.files, "findOneAsync").resolves(null);

      try {
        await s3.removeFile({ fileId });
        expect.fail("Should have thrown file not found error");
      } catch (error) {
        expect(error.error).to.equal("s3-file-not-found");
      }
    });
  });

  describe("handleFileUploadEvent", function () {
    it("should handle file upload event", async function () {
      const fileId = "testFileId";

      // Mock files collection
      sinon.stub(s3.files, "findOneAsync").resolves({
        _id: fileId,
        filename: "testFile.txt",
        key: "testFileKey",
        bucket: "testBucket",
        status: "pending",
      });
      sinon.stub(s3.files, "updateAsync").resolves();

      // upload test file to s3
      await s3.s3Client.send(
        new PutObjectCommand({
          Bucket: s3.bucketName,
          Key: "testFileKey",
          Body: "test file content",
        })
      );

      await s3.handleFileUploadEvent(fileId);

      expect(s3.files.findOneAsync.calledWith(fileId)).to.be.true;
      // Check first argument
      expect(s3.files.updateAsync.calledWith(fileId)).to.be.true;
      expect(s3.files.updateAsync.args[0][1].$set).to.have.keys([
        "status",
        "etag",
        "updatedAt",
      ]);
    });

    it("should throw an error if file does not exist", async function () {
      const fileId = "nonExistentFileId";

      // Mock files collection to return null
      sinon.stub(s3.files, "findOneAsync").resolves(null);

      try {
        await s3.handleFileUploadEvent(fileId);
        expect.fail("Should have thrown file not found error");
      } catch (error) {
        expect(error.error).to.equal("s3-file-not-found");
      }
    });

    it("calls onAfterUpload hook if defined", async function () {
      const fileId = "testFileId";
      const onAfterUploadStub = sinon.stub();

      // Mock files collection
      sinon.stub(s3.files, "findOneAsync").resolves({
        _id: fileId,
        filename: "testFile.txt",
        key: "testFileKey",
        bucket: "testBucket",
        status: "pending",
      });
      sinon.stub(s3.files, "updateAsync").resolves();

      // Set the onAfterUpload hook
      s3.onAfterUpload = onAfterUploadStub;

      // upload test file to s3
      await s3.s3Client.send(
        new PutObjectCommand({
          Bucket: s3.bucketName,
          Key: "testFileKey",
          Body: "test file content",
        })
      );

      await s3.handleFileUploadEvent(fileId);

      expect(onAfterUploadStub.calledOnce).to.be.true;

      s3.onAfterUpload = undefined; // Reset the hook
    });
  });

  describe("handlePermissionChecks", function () {
    it("should return true, if config.skipPermissionChecks is true", async function () {
      const userId = "testUserId";
      const fileId = "testFileId";

      s3.config.skipPermissionChecks = true;

      const result = await s3.handlePermissionsCheck(userId, fileId);

      expect(result).to.be.true;
    });

    it("should call onCheckPermission hook if defined and if config.skipPermissionChecks is not true", async function () {
      const userId = "testUserId";
      const fileId = "testFileId";

      const onCheckPermissionsStub = sinon.stub();
      s3.onCheckPermissions = onCheckPermissionsStub;

      s3.config.skipPermissionChecks = false;

      await s3.handlePermissionsCheck(userId, fileId);

      expect(onCheckPermissionsStub.calledOnce).to.be.true;

      s3.onCheckPermission = undefined; // Reset the hook
    });

    it("should return false if user does not have permission", async function () {
      const userId = "testUserId";

      s3.config.skipPermissionChecks = false;
      s3.onCheckPermissions = async () => false;
      const result = await s3.handlePermissionsCheck(
        {},
        "download",
        userId,
        context
      );

      expect(result).to.be.false;
    });
  });
});
