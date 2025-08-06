import { expect } from "chai";
import sinon from "sinon";
import { MeteorS3 } from "meteor/bratelefant:meteor-s3/server";

describe("Test MeteorS3 class", function () {
    it("should throw an error if config is not provided", function () {
        expect(() => new MeteorS3()).to.throw();  
    });
});
