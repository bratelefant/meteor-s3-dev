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

      const fileId = await s3.uploadFile(file, {}, (progress) => {
        console.log(`Upload progress: ${progress}%`);
      });

      expect(fileId).to.equal("12345");
      expect(MeteorS3Client.uploadFileWithProgress.calledOnce).to.be.true;
      expect(callStub.calledTwice).to.be.true;
      expect(callStub.firstCall.args[0]).to.equal(
        "meteorS3.testBucket.getUploadUrl"
      );
      expect(callStub.firstCall.args[1]).to.deep.include({
        name: file.name,
        size: file.size,
        type: file.type,
      });
      expect(callStub.secondCall.args[0]).to.equal(
        "meteorS3.testBucket.handleFileUploadEvent"
      );
      expect(callStub.secondCall.args[1]).to.equal("12345");
    });

    it("should handle upload errors gracefully", async function () {
      const file = new File(["test"], "test.txt", { type: "text/plain" });
      const s3 = new MeteorS3Client({ name: "testBucket" });

      // Mock the Meteor.callAsync method
      sinon.stub(Meteor, "callAsync").rejects(new Error("Upload failed"));

      try {
        await s3.uploadFile(file, {}, (progress) => {
          console.log(`Upload progress: ${progress}%`);
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
        await s3.uploadFile(null, {}, (progress) => {
          console.log(`Upload progress: ${progress}%`);
        });
      } catch (error) {
        expect(error.message).to.equal("Match error: Expected File");
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

      const result = await s3.getDownloadUrl(fileId);

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
        await s3.getDownloadUrl(fileId);
      } catch (error) {
        expect(error.message).to.equal("File not found");
      } finally {
        Meteor.callAsync.restore();
      }
    });

    it("should throw an error if arguments are not correct", async function () {
      const s3 = new MeteorS3Client({ name: "testBucket" });

      try {
        await s3.getDownloadUrl(null);
      } catch (error) {
        expect(error.message).to.equal(
          "Match error: Expected string, got null"
        );
      }
    });
  });

  describe("downloadFile", function () {
    it("should return the files contents", async function () {
      const s3 = new MeteorS3Client({ name: "testBucket" });
      const fileId = "12345";

      // Mock the Meteor.callAsync method
      const downloadUrlStub = sinon.stub(s3, "getDownloadUrl");
      downloadUrlStub.resolves("http://localhost:3000/download/testfile.txt");

      const result = await s3.downloadFile(fileId);

      expect(result).to.deep.equal("This is the content of testfile.txt");
      expect(downloadUrlStub.calledOnce).to.be.true;
      expect(downloadUrlStub.firstCall.args[0]).to.equal(fileId);
    });

    it("should handle errors gracefully", async function () {
      const s3 = new MeteorS3Client({ name: "testBucket" });
      const fileId = "12345";

      sinon.stub(s3, "getDownloadUrl").rejects(new Error("Invalid URL"));

      try {
        await s3.downloadFile(fileId);
      } catch (error) {
        expect(error.message).to.equal("Invalid URL");
      }
    });

    it("should throw an error if arguments are not correct", async function () {
      const s3 = new MeteorS3Client({ name: "testBucket" });

      try {
        await s3.downloadFile(null);
      } catch (error) {
        expect(error.message).to.equal(
          "Match error: Expected string, got null"
        );
      }
    });
  });

  describe("removeFile", function(){
    it("should remove a file", async function () {
      const s3 = new MeteorS3Client({ name: "testBucket" });
      const fileId = "12345";

      // Mock the Meteor.callAsync method
      const callStub = sinon.stub(Meteor, "callAsync");
      callStub.withArgs("meteorS3.testBucket.removeFile").resolves();

      await s3.removeFile(fileId);

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
        await s3.removeFile(fileId);
      } catch (error) {
        expect(error.message).to.equal("Failed to remove file: File not found [file-remove-failed]");
      } finally {
        Meteor.callAsync.restore();
      }
    });

    it("should throw an error if arguments are not correct", async function () {
      const s3 = new MeteorS3Client({ name: "testBucket" });

      try {
        await s3.removeFile(null);
      } catch (error) {
        expect(error.message).to.equal(
          "Match error: Expected string, got null"
        );
      }
    });
  });
});
