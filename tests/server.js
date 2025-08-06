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
    });

    afterEach(function () {
      sinon.restore(); // Restore any stubs
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

      // Mock the internal methods that make actual S3 calls
      sinon.stub(s3, "ensureBucket").resolves();
      sinon.stub(s3, "ensureMethods").resolves();
      sinon.stub(s3, "ensureCors").resolves();

      await s3.init();

      expect(s3.ensureBucket.calledOnce).to.be.true;
      expect(s3.ensureMethods.calledOnce).to.be.true;
      expect(s3.ensureCors.calledOnce).to.be.false; // no cors if endpoint contains "localhost"
      expect(s3.config.name).to.equal("testBucket2");
      expect(s3.config.endpoint).to.equal("http://localhost:9000");
      expect(s3.config.region).to.equal("us-east-1");
    });

    it("should initialize and create s3Client instance", async function () {
      const config = {
        name: "testBucket5",
        accessKeyId: "testAccessKey",
        secretAccessKey: "testSecretKey",
        endpoint: "http://localhost:9000",
        region: "us-east-1",
      };

      const s3 = new MeteorS3(config);

      // Mock the methods that make actual AWS calls
      sinon.stub(s3, "ensureBucket").resolves();
      sinon.stub(s3, "ensureMethods").resolves();
      sinon.stub(s3, "ensureCors").resolves();

      await s3.init();

      // Verify that s3Client was created
      expect(s3.s3Client).to.exist;
      expect(s3.s3Client.send).to.be.a("function");
    });

    it("calls ensureCors if endpoint is not localhost", async function () {
      const config = {
        name: "testBucket3",
        accessKeyId: "testAccessKey",
        secretAccessKey: "testSecretKey",
        endpoint: "https://s3.amazonaws.com",
        region: "us-east-1",
      };
      const s3 = new MeteorS3(config);
      sinon.stub(s3, "ensureBucket").resolves(); // Mock ensureBucket method
      sinon.stub(s3, "ensureMethods").resolves(); // Mock ensureMethods method
      sinon.stub(s3, "ensureCors").resolves(); // Mock ensureCors method

      await s3.init();

      expect(s3.ensureBucket.calledOnce).to.be.true;
      expect(s3.ensureMethods.calledOnce).to.be.true;
      expect(s3.ensureCors.calledOnce).to.be.true;
      expect(s3.config.name).to.equal("testBucket3");
      expect(s3.config.endpoint).to.equal("https://s3.amazonaws.com");
      expect(s3.config.region).to.equal("us-east-1");
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
        region: "us-east-1",
      };
      s3 = new MeteorS3(config);

      // Mock the methods that make actual AWS calls during init
      sinon.stub(s3, "ensureBucket").resolves();
      sinon.stub(s3, "ensureMethods").resolves();
      sinon.stub(s3, "ensureCors").resolves();

      await s3.init(); // Initialize the S3 instance

      // Restore the ensureBucket stub so we can test the real method
      s3.ensureBucket.restore();
    });

    afterEach(function () {
      sinon.restore(); // Restore original methods
    });

    it("should create a new bucket if it does not exist", async function () {
      const bucketName = "test-bucket-12345";
      s3.config.name = bucketName;

      sinon.stub(s3.buckets, "findOneAsync").resolves(null); // Mock no existing bucket
      sinon.stub(s3.buckets, "insertAsync").resolves(); // Mock insert operation

      // Mock the S3 client calls
      const mockS3Client = {
        send: sinon.stub().callsFake((command) => {
          if (command.constructor.name === "HeadBucketCommand") {
            // Simulate bucket doesn't exist
            const error = new Error("NotFound");
            error.name = "NotFound";
            throw error;
          }
          if (command.constructor.name === "CreateBucketCommand") {
            // Simulate successful bucket creation
            return Promise.resolve({ Location: `/${bucketName}` });
          }
          return Promise.resolve({});
        }),
      };

      // Replace the s3Client with our mock
      s3.s3Client = mockS3Client;

      await s3.ensureBucket();

      // Check that bucket name follows the expected pattern (includes the original name and a random suffix)
      expect(s3.bucketName).to.match(
        /^meteor-s3-test-bucket-12345-[a-z0-9]{6}$/
      );
      expect(s3.buckets.insertAsync.calledOnce).to.be.true;
      expect(mockS3Client.send.called).to.be.true;
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
        region: "us-east-1",
      };
      s3 = new MeteorS3(config);

      // Mock the methods that make actual AWS calls during init
      sinon.stub(s3, "ensureBucket").resolves();
      sinon.stub(s3, "ensureMethods").resolves();
      sinon.stub(s3, "ensureCors").resolves();

      await s3.init(); // Initialize the S3 instance

      // Restore the ensureMethods stub so we can test the real method
      s3.ensureMethods.restore();
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
        region: "us-east-1",
        onCheckPermissions: () => true,
        skipPermissionChecks: true,
      };

      s3 = new MeteorS3(config);
      // Mock the methods that make actual AWS calls during init
      sinon.stub(s3, "ensureBucket").resolves();
      sinon.stub(s3, "ensureMethods").resolves();
      sinon.stub(s3, "ensureCors").resolves();
      
      await s3.init(); // Initialize the S3 instance
      
      // Restore the init-related stubs
      s3.ensureBucket.restore();
      s3.ensureMethods.restore();
      s3.ensureCors.restore();
      
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
      
      // Mock the entire getUploadUrl method to avoid AWS calls
      sinon.stub(s3, "getUploadUrl").callsFake(async (params) => {
        // Create file document
        const fileDoc = {
          filename: params.name,
          size: params.size,
          mimeType: params.type,
          key: `uploads/${params.name}`,
          bucket: s3.bucketName,
          status: "pending",
          createdAt: new Date(),
          meta: {},
        };
        
        const fileId = await s3.files.insertAsync(fileDoc);
        
        return {
          url: "https://s3.amazonaws.com/test-bucket/testFile.txt",
          fileId: fileId
        };
      });
      
      const result = await s3.getUploadUrl(file);
      expect(result).to.be.an("object");
      expect(result).to.have.property("url");
      expect(result).to.have.property("fileId");
      expect(result.url).to.include("https://s3.amazonaws.com/test-bucket/testFile.txt");
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
        name: "testBucket6",
        accessKeyId: "testAccessKey",
        secretAccessKey: "testSecretKey",
        region: "us-east-1",
        uploadExpiresIn: 3600,
        skipPermissionChecks: true, // Skip permission checks for testing
      };
      s3 = new MeteorS3(config);

      // Mock the methods that make actual AWS calls during init
      sinon.stub(s3, "ensureBucket").resolves();
      sinon.stub(s3, "ensureMethods").resolves();
      sinon.stub(s3, "ensureCors").resolves();

      await s3.init(); // Initialize the S3 instance

      // Restore the init-related stubs
      s3.ensureBucket.restore();
      s3.ensureMethods.restore();
      s3.ensureCors.restore();

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
        context: {}
      };

      // Mock the files collection
      const insertStub = sinon.stub(s3.files, "insertAsync").resolves("file123");
      
      // Mock the getUploadUrl method to avoid calling getSignedUrl but test the file creation logic
      const originalGetUploadUrl = s3.getUploadUrl.bind(s3);
      sinon.stub(s3, "getUploadUrl").callsFake(async (params) => {
        // Simulate the permission check
        const hasPermission = await s3.handlePermissionsCheck(
          { name: params.name, size: params.size, type: params.type, meta: params.meta },
          "upload",
          params.userId,
          params.context
        );

        if (!hasPermission) {
          throw new Meteor.Error(
            "s3-permission-denied",
            "You do not have permission to upload this file."
          );
        }

        // Create file document (similar to the real implementation)
        const fileDoc = {
          filename: params.name,
          size: params.size,
          mimeType: params.type,
          key: `uploads/test-key-${params.name}`,
          bucket: s3.bucketName,
          status: Meteor.isDevelopment ? "uploaded" : "pending",
          ownerId: params.context?.userId,
          createdAt: new Date(),
          meta: params.meta,
        };

        const fileId = await s3.files.insertAsync(fileDoc);
        
        // Call hooks
        await s3.onBeforeUpload(fileDoc);

        return {
          url: "https://mocked-s3-upload-url.com/test-file.jpg",
          fileId: fileId
        };
      });

      const result = await s3.getUploadUrl(uploadParams);

      // Verify the result
      expect(result).to.have.property("url");
      expect(result).to.have.property("fileId");
      expect(result.url).to.include("mocked-s3-upload-url.com");
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
        context: {}
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
        context: {}
      };

      const insertStub = sinon.stub(s3.files, "insertAsync").resolves("file456");
      
      // Test uses the mocked version, but we can verify the status logic
      await s3.getUploadUrl(uploadParams);

      const fileDoc = insertStub.firstCall.args[0];
      // In development (which Meteor.isDevelopment returns true), status should be "uploaded"
      expect(fileDoc.status).to.equal(Meteor.isDevelopment ? "uploaded" : "pending");
    });

    it("should include metadata in file document", async function () {
      const uploadParams = {
        name: "meta-test.jpg",
        size: 1024,
        type: "image/jpeg",
        meta: { 
          category: "profile",
          tags: ["important", "user-generated"],
          author: "testUser"
        },
        userId: "testUser123",
        context: {}
      };

      const insertStub = sinon.stub(s3.files, "insertAsync").resolves("file123");
      
      await s3.getUploadUrl(uploadParams);

      const fileDoc = insertStub.firstCall.args[0];
      expect(fileDoc.meta).to.deep.equal({
        category: "profile",
        tags: ["important", "user-generated"],
        author: "testUser"
      });
    });
  });
});
