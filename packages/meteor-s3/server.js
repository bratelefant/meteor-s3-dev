import { Mongo } from "meteor/mongo";
import { Random } from "meteor/random";
import { check, Match } from "meteor/check";
import { configSchema } from "./schemas/config";
import {
  S3Client,
  CreateBucketCommand,
  HeadBucketCommand,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { MeteorS3BucketsSchema } from "./schemas/buckets";
import "meteor/aldeed:collection2/dynamic";
import { MeteorS3FilesSchema } from "./schemas/files";

function generateValidBucketName(instanceName) {
  const slugified = instanceName
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-") // nur a-z, 0-9, -
    .replace(/^-+/, "") // führende - entfernen
    .replace(/-+$/, "") // abschließende - entfernen
    .replace(/--+/g, "-"); // doppelte -- zu einem -

  const randomSuffix = Random.id(6).toLowerCase(); // z. B. "a9x7kq"
  const baseName = `meteor-s3-${slugified}-${randomSuffix}`;

  return baseName.substring(0, 63); // max 63 Zeichen laut S3-Regeln
}

/**
 * This class provides methods to get pre-signed URLs for uploading and downloading files to/from S3.
 * It also manages the file metadata in a MongoDB collection.
 * Each instance must have a unique name, so you can have multiple instances of MeteorS3 in your application.
 * @locus server
 */
export class MeteorS3 {
  constructor(config) {
    configSchema.validate(config);
    this.config = config;
    // State and meta infos about Files of this instance are stored here
    this.files = new Mongo.Collection("meteor_s3_files_" + config.name);
    // Buckets are organized globally across all instances, but each class instance uses exactly one bucket
    this.buckets = new Mongo.Collection("meteor_s3_buckets");
    Collection2.load().then(() => {
      this.buckets.attachSchema(MeteorS3BucketsSchema);
      this.files.attachSchema(MeteorS3FilesSchema);
    });
    this.buckets
      .createIndexAsync({ instanceName: 1 }, { unique: true })
      .catch((e) => {
        console.error(
          "Failed to create index on meteor_s3_buckets collection:",
          e
        );
      });
    // Initialize empty hooks. Override these in your app to add custom behavior.
    this.onBeforeUpload = async (fileDoc) => {};
    this.onAfterUpload = async (fileDoc) => {};
    // actions are "upload", "download" or "delete"
    this.onCheckPermissions = async (fileDoc, action, userId) => true;
  }

  /**
   * Initializes the S3 client and ensures the bucket for this instance exists.
   * This also sets up the server methods for file uploads and downloads.
   * This method should be called once when the application starts.
   * It sets up the S3 client and checks if the bucket exists, creating it if necessary.
   *
   * Call this in your Meteor server startup code:
   * @example
   * ```javascript
   * import { MeteorS3 } from 'meteor/bratelefant:meteor-s3';
   * const s3 = new MeteorS3({ name: "myInstance", accessKeyId: "yourAccessKey", secretAccessKey: "yourSecretKey" });
   *
   * Meteor.startup(async () => {
   *   await s3.init();
   * });
   * ```
   * @returns {Promise<void>}
   */
  async init() {
    // Initialization logic for S3 client
    this.log(`Initializing S3 client ${this.config.name}`);
    this.s3Client = new S3Client({
      credentials: {
        accessKeyId: this.config.accessKeyId,
        secretAccessKey: this.config.secretAccessKey,
      },
      region: this.config.region,
    });

    // Check, if there is already a bucket registered for this instance
    await this.ensureBucket();
    await this.ensureMethods();
    this.log(`S3 client ${this.config.name} initialized successfully.`);
  }

  /**
   * Ensure that the bucket for this instance exists.
   * If it does not exist, it will be created.
   * If it exists, it will be registered in the database.
   * This will also set this.bucketName properties.
   */
  async ensureBucket() {
    const existingBucket = await this.buckets.findOneAsync({
      instanceName: this.config.name,
    });

    if (existingBucket) {
      this.bucketName = existingBucket.bucketName;
      this.log(`Using existing bucket: ${this.bucketName}`);
      // Check if the bucket exists in S3
      try {
        await this.s3Client.send(
          new HeadBucketCommand({ Bucket: this.bucketName })
        );
        this.log(`Bucket ${this.bucketName} exists in S3.`);
      } catch (error) {
        throw new Meteor.Error(
          "s3-bucket-access",
          `Failed to access S3 bucket: ${error.message}`
        );
      }
      // Ensure the bucket's region matches the configured region
      if (existingBucket.region !== this.config.region) {
        console.warn(
          `Bucket region mismatch: expected ${this.config.region}, found ${existingBucket.region}.`
        );
        // Optionally, you could handle this case by updating the bucket's region or throwing an error.
      }
      this.log(`Bucket ${this.bucketName} is ready for use.`);
      return;
    } else {
      // Create a new bucket
      const newBucket = {
        instanceName: this.config.name,
        bucketName: generateValidBucketName(this.config.name),
        region: this.config.region,
        createdAt: new Date(),
      };
      // Create the bucket in S3
      try {
        await this.s3Client.send(
          new CreateBucketCommand({
            Bucket: newBucket.bucketName,
            CreateBucketConfiguration: {
              LocationConstraint: this.config.region,
            },
          })
        );
        this.log(`Created new S3 bucket: ${newBucket.bucketName}`);
      } catch (error) {
        console.error("Error creating S3 bucket:", error);
        throw new Meteor.Error(
          "s3-bucket-creation",
          `Failed to create S3 bucket: ${error.message}`,
          error
        );
      }
      await this.buckets.insertAsync(newBucket);
      this.bucketName = newBucket.bucketName;
      this.log(`Created new bucket: ${this.bucketName}`);
    }
  }

  /**
   * Ensures that the server methods for file uploads and downloads are available.
   * This is called automatically when the instance is initialized and should not be called manually.
   * @returns {Promise<void>}
   */
  async ensureMethods() {
    // Ensure that the methods are available on the server
    if (!Meteor.isServer) {
      throw new Meteor.Error(
        "method-not-available",
        "This method is only available on the server."
      );
    }
    Meteor.methods({
      [`meteorS3.${this.config.name}.getUploadUrl`]: async ({
        name,
        size,
        type,
        meta = {},
      }) => {
        check(name, String);
        check(size, Number);
        check(type, String);
        check(meta, Object);

        return await this.getUploadUrl({
          name,
          size,
          type,
          meta,
          userId: Meteor.userId(),
        });
      },

      [`meteorS3.${this.config.name}.getDownloadUrl`]: async (fileId) => {
        check(fileId, String);
        return await this.getDownloadUrl(fileId, Meteor.userId());
      },

      /**
       * Right now it is neccessary to call this method after the file is uploaded.
       * The MeteorS3 client will do this automatically after the upload.
       *
       * In the future, this will not be neccessary in production anymore, since a S3 event trigger
       * will call the handleFileUpload handler automatically.
       * @param {*} fileId
       * @returns {Promise<MeteorS3FilesSchema>}
       */
      [`meteorS3.${this.config.name}.handleFileUploadEvent`]: async (
        fileId
      ) => {
        check(fileId, String);
        return await this.handleFileUploadEvent(fileId);
      },
    });
  }

  /**
   * This method generates a pre-signed URL for uploading a file to S3.
   * It also creates a file document in the database to track the upload.
   *
   * Remember:
   * In development mode, the file status is set to "uploaded" immediately, since we can not call the webhook
   * from the event trigger in S3. This can lead to inconsistencies in the file status, since in general
   * the file will be uploaded by the client directly to S3.
   *
   * In production, the status will be set to "pending" and will be updated by the S3 event trigger
   * when the file is successfully uploaded.
   *
   * @param {*} param0
   * @returns
   */
  async getUploadUrl({ name, size, type, meta = {}, userId }) {
    // Validate input parameters
    check(name, String);
    check(size, Number);
    check(type, String);
    check(meta, Object);
    check(userId, Match.Maybe(String));

    // Generate a pre-signed URL for uploading the file
    // The key is a unique identifier for the file in S3
    const params = {
      Bucket: this.bucketName,
      Key: `uploads/${Random.id()}-${name}`,
      ContentType: type,
    };

    // Create a file document to store in the database
    const fileDoc = {
      filename: name,
      size,
      mimeType: type,
      key: params.Key,
      bucket: this.bucketName,
      status: Meteor.isDevelopment ? "uploaded" : "pending", // In production, status "uploaded" will only be set by an event trigger on the S3 bucket
      ownerId: userId, // Set this if you have user management
      createdAt: new Date(),
      meta,
    };

    const fileId = await this.files.insertAsync(fileDoc);

    this.log(`Generated upload URL for file: ${name}`);

    // Check permissions before generating the URL
    const hasPermission = await this.onCheckPermissions(
      fileDoc,
      "upload",
      userId
    );
    if (!hasPermission) {
      throw new Meteor.Error(
        "s3-permission-denied",
        "You do not have permission to upload this file."
      );
    }

    // call hook before upload
    await this.onBeforeUpload(fileDoc);

    const url = await getSignedUrl(
      this.s3Client,
      new PutObjectCommand(params),
      {
        expiresIn: this.config.uploadExpiresIn,
      }
    );
    return {
      url,
      fileId, // Return the file ID for later reference
    };
  }

  /**
   * This method generates a pre-signed URL for downloading a file from S3.
   * It checks permissions and the file status before generating the URL.
   *
   * @param {String} fileId - The ID of the file document in the database.
   * @param {String} [userId] - The ID of the user requesting the download (optional).
   * @returns {Promise<String>} - The pre-signed URL for downloading the file.
   */
  async getDownloadUrl(fileId, userId) {
    // Validate the file document
    check(fileId, String);
    check(userId, Match.Maybe(String));
    const fileDoc = await this.files.findOneAsync(fileId);
    if (!fileDoc) {
      throw new Meteor.Error("s3-file-not-found", "File not found.");
    }

    // Check permissions before generating the URL
    const hasPermission = await this.onCheckPermissions(
      fileDoc,
      "download",
      userId
    );

    if (!hasPermission) {
      throw new Meteor.Error(
        "s3-permission-denied",
        "You do not have permission to download this file."
      );
    }

    // check status
    if (fileDoc.status !== "uploaded") {
      throw new Meteor.Error(
        "s3-file-not-ready",
        "File is not ready for download."
      );
    }

    // Generate a pre-signed URL for downloading the file
    const params = {
      Bucket: this.bucketName,
      Key: fileDoc.key,
    };

    return getSignedUrl(this.s3Client, new GetObjectCommand(params), {
      expiresIn: this.config.downloadExpiresIn,
    });
  }

  /**
   * This method handles the file upload event.
   * It updates the file status to "uploaded" and calls the onAfterUpload hook.
   * This is typically called by an S3 event trigger when a file is successfully uploaded.
   * In development mode, the client needs to call this method manually after uploading the file.
   *
   * @param {*} fileId
   * @returns
   */
  async handleFileUploadEvent(fileId) {
    // Validate the file document
    check(fileId, String);

    const fileDoc = await this.files.findOneAsync(fileId);
    if (!fileDoc) {
      throw new Meteor.Error("s3-file-not-found", "File not found.");
    }

    // Get the file infos from S3
    const headParams = {
      Bucket: this.bucketName,
      Key: fileDoc.key,
    };

    let headResponse;
    try {
      headResponse = await this.s3Client.send(
        new HeadObjectCommand(headParams)
      );
    } catch (error) {
      throw new Meteor.Error(
        "s3-file-not-found",
        `File not found in S3: ${error.message}`
      );
    }

    // Update the file status to "uploaded"
    await this.files.updateAsync(fileId, {
      $set: {
        status: "uploaded",
        etag: headResponse.ETag,
        updatedAt: new Date(),
      },
    });

    // call hook after upload
    await this.onAfterUpload(fileDoc);

    this.log(`File ${fileDoc.filename} uploaded successfully.`);
    return fileDoc;
  }

  /**
   * Log messages if verbose mode is enabled.
   * @param {...any} args - The arguments to log.
   */
  log(...args) {
    if (this.config.verbose) {
      console.log(`MeteorS3::[${this.config.name}]`, ...args);
    }
  }
}
