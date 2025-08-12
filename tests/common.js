import { expect } from "chai";
import sinon from "sinon";
import { MeteorS3Client } from "meteor/bratelefant:meteor-s3/common";

describe("Test MeteorS3Client (isomorphic)", function () {
  afterEach(function () {
    sinon.restore();
  });

  describe("constructor", function () {
    it("should throw an error if config is not provided", function () {
      expect(() => new MeteorS3Client()).to.throw();
    });

    it("constructor with minimal valid config object", function () {
      const config = {
        name: "testBucket",
      };
      const s3 = new MeteorS3Client(config);
      expect(s3.config).to.deep.include(config);
    });

    it("constructor with string argument setting instance name", function () {
      const s3 = new MeteorS3Client("testBucket");
      expect(s3.config.name).to.equal("testBucket");
    });
  });

  describe("uploadFileWithProgress", function () {
    it("should upload a file and report progress", async function () {
      const file = new File(["test"], "test.txt", { type: "text/plain" });
      const onProgress = sinon.spy();

      const uploadPromise = MeteorS3Client.uploadFileWithProgress(
        "http://localhost:3000/upload",
        file,
        onProgress
      );

      await uploadPromise;

      expect(onProgress.called).to.be.true;
      expect(onProgress.firstCall.args[0]).to.be.a("number");
    });
  });

  describe("getUploadUrl", function () {
    it("should return a pre-signed URL and file ID", async function () {
      const s3 = new MeteorS3Client({ name: "testBucket" });
      const file = new File(["test"], "test.txt", { type: "text/plain" });
      const callStub = sinon.stub(Meteor, "callAsync");
      callStub.withArgs("meteorS3.testBucket.getUploadUrl").resolves({
        url: "http://localhost:3000/upload",
        fileId: "12345",
      });

      const result = await s3.getUploadUrl({
        name: file.name,
        size: file.size,
        type: file.type,
      });

      expect(callStub.calledOnce).to.be.true;
      expect(callStub.firstCall.args[0]).to.equal(
        "meteorS3.testBucket.getUploadUrl"
      );
      expect(callStub.firstCall.args[1]).to.deep.include({
        name: file.name,
        size: file.size,
        type: file.type,
      });
      expect(result).to.have.property("url");
      expect(result).to.have.property("fileId");
    });

    it("should fail if arguments are not correct", async function () {
      const s3 = new MeteorS3Client({ name: "testBucket" });

      try {
        await s3.getUploadUrl({
          name: null,
          size: 0,
          type: "text/plain",
        });
      } catch (error) {
        expect(error.message).to.equal("Invalid file name [invalid-name]");
      }
    });

    it("should handle errors gracefully", async function () {
      const s3 = new MeteorS3Client({ name: "testBucket" });

      // Mock the Meteor.callAsync method
      const callStub = sinon.stub(Meteor, "callAsync");
      callStub
        .withArgs("meteorS3.testBucket.getUploadUrl")
        .rejects(new Error("Network error"));

      try {
        await s3.getUploadUrl({
          name: "test.txt",
          size: 1024,
          type: "text/plain",
        });
      } catch (error) {
        expect(error.message).to.equal("Network error");
      } finally {
        callStub.restore();
      }
    });
  });

  describe("uploadFile", function () {
    it("should upload a file and return the file ID", async function () {
      const file = new File(["test"], "test.txt", { type: "text/plain" });
      const s3 = new MeteorS3Client({ name: "testBucket" });

      // Mock the Meteor.callAsync method if the methodname (first argument) is meteorS3.testBucket.getUploadUrl
      const callStub = sinon.stub(Meteor, "callAsync");

      callStub.withArgs("meteorS3.testBucket.getUploadUrl").resolves({
        url: "http://localhost:3000/upload",
        fileId: "12345",
      });
      callStub.withArgs("meteorS3.testBucket.handleFileUploadEvent").resolves();

      sinon.spy(MeteorS3Client, "uploadFileWithProgress");

      const fileId = await s3.uploadFile({
        file,
        meta: {},
        onProgress: (progress) => {
          // Simulate progress callback
          expect(progress).to.be.a("number");
        },
      });

      expect(fileId).to.equal("12345");
      expect(MeteorS3Client.uploadFileWithProgress.calledOnce).to.be.true;
      expect(callStub.calledOnce).to.be.true;
      expect(callStub.firstCall.args[0]).to.equal(
        "meteorS3.testBucket.getUploadUrl"
      );
      expect(callStub.firstCall.args[1]).to.deep.include({
        name: file.name,
        size: file.size,
        type: file.type,
      });
    });

    it("should handle upload errors gracefully", async function () {
      const file = new File(["test"], "test.txt", { type: "text/plain" });
      const s3 = new MeteorS3Client({ name: "testBucket" });

      // Mock the Meteor.callAsync method
      sinon.stub(Meteor, "callAsync").rejects(new Error("Upload failed"));

      try {
        await s3.uploadFile({
          file,
          meta: {},
          onProgress: (progress) => {
            expect(progress).to.be.a("number");
          },
        });
      } catch (error) {
        expect(error.message).to.equal("Upload failed");
      } finally {
        Meteor.callAsync.restore();
      }
    });

    it("should throw an error if arguments are not correct", async function () {
      const s3 = new MeteorS3Client({ name: "testBucket" });

      try {
        await s3.uploadFile({
          file: null,
          meta: {},
          onProgress: (progress) => {
            expect(progress).to.be.a("number");
          },
        });
      } catch (error) {
        expect(error.message).to.equal("Invalid file object [invalid-file]");
      }
    });
  });

  describe("getDownloadUrl", function () {
    it("should return a download URL for a file", async function () {
      const s3 = new MeteorS3Client({ name: "testBucket" });
      const fileId = "12345";

      // Mock the Meteor.callAsync method
      const callStub = sinon.stub(Meteor, "callAsync");
      callStub.withArgs("meteorS3.testBucket.getDownloadUrl").resolves({
        url: "http://localhost:3000/download/12345",
        fileId: "12345",
      });

      const result = await s3.getDownloadUrl({ fileId });

      expect(result).to.deep.equal({
        url: "http://localhost:3000/download/12345",
        fileId: "12345",
      });
      expect(callStub.calledOnce).to.be.true;
      expect(callStub.firstCall.args[0]).to.equal(
        "meteorS3.testBucket.getDownloadUrl"
      );
      expect(callStub.firstCall.args[1]).to.deep.equal({
        fileId: "12345",
        context: {},
      });
    });

    it("should handle errors gracefully", async function () {
      const s3 = new MeteorS3Client({ name: "testBucket" });
      const fileId = "12345";

      // Mock the Meteor.callAsync method
      const callStub = sinon.stub(Meteor, "callAsync");
      callStub
        .withArgs("meteorS3.testBucket.getDownloadUrl")
        .rejects(new Error("File not found"));

      try {
        await s3.getDownloadUrl({ fileId });
      } catch (error) {
        expect(error.message).to.equal("File not found");
      } finally {
        Meteor.callAsync.restore();
      }
    });

    it("should throw an error if arguments are not correct", async function () {
      const s3 = new MeteorS3Client({ name: "testBucket" });

      try {
        await s3.getDownloadUrl({ fileId: null });
      } catch (error) {
        expect(error.message).to.equal("Invalid file ID [invalid-fileId]");
      }
    });
  });

  describe("head", function () {
    it("should return the file metadata", async function () {
      const s3 = new MeteorS3Client({ name: "testBucket" });
      const fileId = "12345";

      // Mock the Meteor.callAsync method
      const callStub = sinon.stub(Meteor, "callAsync");
      callStub.withArgs("meteorS3.testBucket.head").resolves({
        fileId: "12345",
        size: 1024,
        type: "text/plain",
        status: "uploaded",
      });

      const result = await s3.head({ fileId });

      expect(result).to.deep.equal({
        fileId: "12345",
        size: 1024,
        type: "text/plain",
        status: "uploaded",
      });
      expect(callStub.calledOnce).to.be.true;
      expect(callStub.firstCall.args[0]).to.equal("meteorS3.testBucket.head");
      expect(callStub.firstCall.args[1]).to.deep.equal({
        fileId: "12345",
        context: {},
      });
    });

    it("should throw an error if arguments are not correct", async function () {
      const s3 = new MeteorS3Client({ name: "testBucket" });

      try {
        await s3.head({ fileId: null });
      } catch (error) {
        expect(error.message).to.equal("Invalid file ID [invalid-fileId]");
      }
    });

    it("should handle serverside errors", async function () {
      const s3 = new MeteorS3Client({ name: "testBucket" });
      const fileId = "12345";

      // Mock the Meteor.callAsync method
      const callStub = sinon.stub(Meteor, "callAsync");
      callStub
        .withArgs("meteorS3.testBucket.head")
        .rejects(new Error("File not found"));

      try {
        await s3.head({ fileId });
      } catch (error) {
        expect(error.message).to.equal("File not found");
      } finally {
        Meteor.callAsync.restore();
      }
    });
  });

  describe("removeFile", function () {
    it("should remove a file", async function () {
      const s3 = new MeteorS3Client({ name: "testBucket" });
      const fileId = "12345";

      // Mock the Meteor.callAsync method
      const callStub = sinon.stub(Meteor, "callAsync");
      callStub.withArgs("meteorS3.testBucket.removeFile").resolves();

      await s3.removeFile({ fileId });

      expect(callStub.calledOnce).to.be.true;
      expect(callStub.firstCall.args[0]).to.equal(
        "meteorS3.testBucket.removeFile"
      );
      expect(callStub.firstCall.args[1]).to.deep.equal({
        fileId: "12345",
        context: {},
      });
    });

    it("should handle errors gracefully", async function () {
      const s3 = new MeteorS3Client({ name: "testBucket" });
      const fileId = "12345";

      // Mock the Meteor.callAsync method
      const callStub = sinon.stub(Meteor, "callAsync");
      callStub
        .withArgs("meteorS3.testBucket.removeFile")
        .rejects(new Error("File not found"));

      try {
        await s3.removeFile({ fileId });
      } catch (error) {
        expect(error.message).to.equal(
          "Failed to remove file: File not found [file-remove-failed]"
        );
      } finally {
        Meteor.callAsync.restore();
      }
    });

    it("should throw an error if arguments are not correct", async function () {
      const s3 = new MeteorS3Client({ name: "testBucket" });

      try {
        await s3.removeFile({ fileId: null });
      } catch (error) {
        expect(error.message).to.equal("Invalid file ID [invalid-fileId]");
      }
    });
  });
});
