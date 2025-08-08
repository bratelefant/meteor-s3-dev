import assert from "assert";

// Setup PUT endpoint for testing
if (Meteor.isServer) {
  WebApp.handlers.put("/upload", (req, res) => {
    // Simulate a successful upload response
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: "File uploaded successfully" }));
  });
}

describe("check test environment", function () {
  it("package.json has correct name", async function () {
    const { name } = await import("../package.json");
    assert.strictEqual(name, "meteor-app");
  });

  if (Meteor.isClient) {
    it("client is not server", function () {
      assert.strictEqual(Meteor.isServer, false);
    });
  }

  if (Meteor.isServer) {
    it("server is not client", function () {
      assert.strictEqual(Meteor.isClient, false);
    });
  }
});
