import { MongoInternals } from "meteor/mongo";

export const resetDb = async () => {
  if (!Meteor.isTest) throw new Meteor.Error(500, "Only in tests.");
  if (!Meteor.isServer) throw new Meteor.Error(500, "Only server side");

  const collections =
    await MongoInternals.defaultRemoteCollectionDriver().mongo.db.collections();

  const appCollections = collections.filter(
    (col) => !col.collectionName.startsWith("velocity")
  );

  for (const appCollection of appCollections) {
    // drop the collection
    await appCollection.deleteMany({});
  }
};
