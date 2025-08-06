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
  PutBucketCorsCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { MeteorS3BucketsSchema } from "./schemas/buckets";
import "meteor/aldeed:collection2/dynamic";
import { MeteorS3FilesSchema } from "./schemas/files";

/**
 * This class provides methods to get pre-signed URLs for uploading and downloading files to/from S3.
 * It also manages the file metadata in a MongoDB collection.
 * Each instance must have a unique name, so you can have multiple instances of MeteorS3 in your application.
 * @locus server
 */
export class MeteorS3 {
  constructor(config) {
    // check if the config is valid and set it
    configSchema.validate(config);
    this.config = config;

    // State and meta infos about Files of this instance are stored here
    this.files =
      Mongo.Collection.get("meteor_s3_files_" + config.name) ||
      new Mongo.Collection("meteor_s3_files_" + config.name);

    // Buckets are organized globally across all instances, but each class instance uses exactly one bucket
    this.buckets =
      Mongo.Collection.get("meteor_s3_buckets") ||
      new Mongo.Collection("meteor_s3_buckets");

    // Attach schemas to collections
    Collection2.load().then(() => {
      this.buckets.attachSchema(MeteorS3BucketsSchema);
      this.files.attachSchema(MeteorS3FilesSchema);
    });

    // Create indexes for faster access and ensure uniqueness
    this.buckets
      .createIndexAsync({ instanceName: 1 }, { unique: true })
      .catch((e) => {
        console.error(
          "Failed to create index on meteor_s3_buckets collection:",
          e
        );
      });

    // Initialize empty hooks. Override these in your app to add custom behavior.
    this.onBeforeUpload = async (_fileDoc) => {};
    this.onAfterUpload = async (_fileDoc) => {};

    // actions are "upload", "download" or "delete"
    this.onCheckPermissions =
      this.config.onCheckPermissions ||
      (async (fileDoc, action, _userId, _context) => {
        // Default implementation always denies access
        console.warn(
          `No permission check function provided. Defaulting to deny all actions for file ${fileDoc._id} and action "${action}".`
        );
        return false; // Deny all actions by default
      });
  }

  /**
   * internal helper function to generate a valid S3 bucket name
   * @param {String} instanceName - The name of the instance to generate a bucket name for.
   * @returns {String} - A valid S3 bucket name based on the instance name.
   */
  static generateValidBucketName(instanceName) {
    const slugified = instanceName
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/^-+/, "")
      .replace(/-+$/, "")
      .replace(/--+/g, "-");

    const randomSuffix = Random.id(6).toLowerCase();
    const baseName = `meteor-s3-${slugified}-${randomSuffix}`;

    return baseName.substring(0, 63);
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
      endpoint: this.config.endpoint,
      forcePathStyle: this.config.endpoint?.includes("localhost"),
      credentials: {
        accessKeyId: this.config.accessKeyId,
        secretAccessKey: this.config.secretAccessKey,
      },
      region: this.config.region,
    });

    // Check, if there is already a bucket registered for this instance
    await this.ensureBucket();

    // Minio does not support CORS, and we dont need it when working locally.
    if (!this.config.endpoint?.includes("localhost")) await this.ensureCors();

    // Ensure that the methods for file uploads and downloads are available
    await this.ensureMethods();
    this.log(`S3 client ${this.config.name} initialized successfully.`);
  }

  /**
   * Ensure that the bucket for this instance exists.
   * If it does not exist, it will be created.
   * If it exists, it will be registered in the database.
   * This will also set this.bucketName properties.
   * @returns {Promise<void>}
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
        console.error("S3 HeadBucket error:", error);
        throw new Meteor.Error(
          "s3-bucket-access",
          `Failed to access S3 bucket: ${error.name}`,
          error
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
        bucketName: MeteorS3.generateValidBucketName(this.config.name),
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

  async ensureCors() {
    // Ensure CORS configuration for the bucket
    const corsConfig = {
      Bucket: this.bucketName,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedHeaders: ["*"],
            AllowedMethods: ["GET", "PUT", "POST", "DELETE"],
            AllowedOrigins: [
              Meteor.isDevelopment ? "*" : Meteor.absoluteUrl().slice(0, -1),
            ],
            MaxAgeSeconds: 3000,
          },
        ],
      },
    };
    try {
      await this.s3Client.send(new PutBucketCorsCommand(corsConfig));
      this.log(`CORS configuration set for bucket: ${this.bucketName}`);
    } catch (error) {
      console.error("Error setting CORS configuration:", error);
      throw new Meteor.Error(
        "s3-cors-configuration",
        `Failed to set CORS configuration for bucket: ${error.message}`,
        error
      );
    }
  }

  /**
   * Ensures that the server methods for file uploads and downloads are available.
   * This is called automatically when the instance is initialized and should not be called manually.
   * @returns {Promise<void>}
   */
  async ensureMethods() {
    const self = this; // Preserve context for methods
    // Ensure that the methods are available on the server
    if (!Meteor.isServer) {
      throw new Meteor.Error(
        "method-not-available",
        "This method is only available on the server."
      );
    }
    Meteor.methods({
      [`meteorS3.${this.config.name}.getUploadUrl`]: async function ({
        name,
        size,
        type,
        meta = {},
        context = {},
      }) {
        check(name, String);
        check(size, Number);
        check(type, String);
        check(meta, Object);
        check(context, Object);

        return await self.getUploadUrl({
          name,
          size,
          type,
          meta,
          context,
          userId: Meteor.userId(), // Add userId to context for permission checks
        });
      },

      [`meteorS3.${this.config.name}.getDownloadUrl`]: async ({
        fileId,
        context = {},
      }) => {
        check(fileId, String);
        check(context, Object);
        return await self.getDownloadUrl({
          fileId,
          context,
          userId: Meteor.userId(),
        });
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
        return await self.handleFileUploadEvent(fileId);
      },

      [`meteorS3.${this.config.name}.removeFile`]: async function ({
        fileId,
        context = {},
      }) {
        check(fileId, String);
        check(context, Object);
        return await self.removeFile({
          fileId,
          context,
          userId: Meteor.userId(),
        });
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
   * @param {String} param0.name - The name of the file to be uploaded.
   * @param {Number} param0.size - The size of the file in bytes.
   * @param {String} param0.type - The MIME type of the file (e.g., "image/png").
   * @param {Object} [param0.meta={}] - Additional metadata to store with the file.
   * @param {String} [param0.userId] - The ID of the user uploading the file (optional).
   * @param {Object} [param0.context={}] - Additional context for permission checks (optional).
   * @throws {Meteor.Error} If the user does not have permission to upload the file or if the bucket is not configured correctly.
   * @throws {Meteor.Error} If the file document cannot be created or if the upload URL cannot be generated.
   * @returns {Promise<Object>} - An object containing the pre-signed URL for uploading the file and the file ID.
   */
  async getUploadUrl({ name, size, type, meta = {}, userId, context = {} }) {
    // Validate input parameters
    check(name, String);
    check(size, Number);
    check(type, String);
    check(meta, Object);
    check(userId, Match.Maybe(String));
    check(context, Object);

    // Check permissions before generating the URL
    const hasPermission = await this.handlePermissionsCheck(
      { name, size, type, meta },
      "upload",
      userId,
      context
    );

    if (!hasPermission) {
      throw new Meteor.Error(
        "s3-permission-denied",
        "You do not have permission to upload this file."
      );
    }

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
      ownerId: context?.userId, // Set this if you have user management
      createdAt: new Date(),
      meta,
    };

    const fileId = await this.files.insertAsync(fileDoc);

    // call hook before upload
    await this.onBeforeUpload(fileDoc);

    const url = await getSignedUrl(
      this.s3Client,
      new PutObjectCommand(params),
      {
        expiresIn: this.config.uploadExpiresIn,
      }
    );
    this.log(`Generated upload URL for file: ${name}`);

    return {
      url,
      fileId, // Return the file ID for later reference
    };
  }

  /**
   * This method generates a pre-signed URL for downloading a file from S3.
   * It checks permissions and the file status before generating the URL.
   *
   * @param {Object} param0 - The parameters for generating the download URL.
   * @param {String} param0.fileId - The ID of the file to be downloaded.
   * @param {Object} [param0.context={}] - Additional context for permission checks (optional).
   * @param {String} [param0.userId] - The ID of the user requesting the download (optional).
   * @throws {Meteor.Error} If the file does not exist, if the user does not have permission to download the file, or if the file is not ready for download.
   * @throws {Meteor.Error} If the file status is not "uploaded".
   * @throws {Meteor.Error} If the S3 client fails to generate the pre-signed URL.
   * @returns {Promise<String>} - The pre-signed URL for downloading the file.
   */
  async getDownloadUrl({ fileId, context = {}, userId }) {
    // Validate the file document
    check(fileId, String);
    check(context, Object);
    const fileDoc = await this.files.findOneAsync(fileId);
    if (!fileDoc) {
      throw new Meteor.Error("s3-file-not-found", "File not found.");
    }

    // Check permissions before generating the URL
    const hasPermission = await this.handlePermissionsCheck(
      fileDoc,
      "download",
      userId,
      context
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

  async removeFile({ fileId, context = {}, userId }) {
    // Validate the file document
    check(fileId, String);
    check(context, Object);
    check(userId, Match.Maybe(String));
    const fileDoc = await this.files.findOneAsync(fileId);
    if (!fileDoc) {
      throw new Meteor.Error("s3-file-not-found", "File not found.");
    }
    // Check permissions before removing the file
    const hasPermission = await this.handlePermissionsCheck(
      fileDoc,
      "delete",
      userId,
      context
    );

    if (!hasPermission) {
      throw new Meteor.Error(
        "s3-permission-denied",
        "You do not have permission to delete this file."
      );
    }

    // Remove the file from S3
    const params = {
      Bucket: this.bucketName,
      Key: fileDoc.key,
    };

    try {
      await this.s3Client.send(new DeleteObjectCommand(params));
    } catch (error) {
      throw new Meteor.Error(
        "s3-delete-failed",
        `Failed to delete file from S3: ${error.message}`
      );
    }
    await this.files.removeAsync(fileId);
  }

  /**
   * This method handles the file upload event.
   * It updates the file status to "uploaded" and calls the onAfterUpload hook.
   * This is typically called by an S3 event trigger when a file is successfully uploaded.
   * In development mode, the client needs to call this method manually after uploading the file.
   *
   * @param {String} fileId
   * @throws {Meteor.Error} If the file document is not found or if the file is not found in S3.
   * @throws {Meteor.Error} If the file status cannot be updated or if the S3 client fails to retrieve the file metadata.
   * @returns {Promise<MeteorS3FilesSchema>} - The updated file document.
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
   * Handles permission checks for file actions.
   * This is an internal method and primarily used to call the onCheckPermissions hook.
   * If the skipPermissionChecks config is set to true, it will skip the permission checks.
   * @param {Object} fileDoc - The file document to check permissions for.
   * @param {String} action - The action to check permissions for (e.g., "upload", "download").
   * @param {String} userId - The ID of the user requesting the action.
   * @param {Object} context - Additional context for permission checks (optional).
   * @throws {Meteor.Error} If the permission check fails or if the onCheckPermissions hook is not defined.
   * @returns {Promise<Boolean>} - Returns true if the user has permission, false otherwise.
   */
  async handlePermissionsCheck(fileDoc, action, userId, context) {
    if (this.config.skipPermissionChecks) {
      this.log(
        `Skipping permission checks for action "${action}" on file ${fileDoc._id}`
      );
      return true;
    }
    // Default implementation always denies access
    return this.onCheckPermissions(fileDoc, action, userId, context);
  }

  /**
   * Log messages if verbose mode is enabled.
   * @param {...any} args - The arguments to log.
   */
  log(...args) {
    if (this.config.verbose) {
      // eslint-disable-next-line no-console
      console.log(`MeteorS3::[${this.config.name}]`, ...args);
    }
  }
}
