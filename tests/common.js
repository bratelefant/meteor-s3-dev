import { expect } from "chai";
import sinon from "sinon";
import { MeteorS3Client } from "meteor/bratelefant:meteor-s3/common";

describe("Test MeteorS3Client (isomorphic)", function () {
  describe("constructor", function () {
    it("should throw an error if config is not provided", function () {
      expect(() => new MeteorS3Client()).to.throw();
    });

    it("constructor with minimal valid config", function () {
      const config = {
        name: "testBucket",
      };
      const s3 = new MeteorS3Client(config);
      expect(s3.config).to.deep.include(config);
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
});
