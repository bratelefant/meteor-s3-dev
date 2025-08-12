import axios from "axios";

/**
 * Meteor S3 Client
 * This class provides methods to interact with S3 for file uploads and downloads.
 * It uses Meteor's callAsync method to communicate with the server-side methods.
 * It supports uploading files, getting download URLs, downloading files as blobs, and opening files in a new tab.
 * @locus client or server
 */
export class MeteorS3Client {
  constructor(config) {
    if (typeof config === "string") {
      // If a string is passed, treat it as the instance name
      config = { name: config, verbose: false };
    }

    // Validate the configuration against the client schema
    if (!config.name || typeof config.name !== "string") {
      throw new Meteor.Error("invalid-config", "Invalid configuration object");
    }
    this.config = config;

    this.log(`Initializing MeteorS3Client for instance: ${this.config.name}`);
  }

  /**
   * Internal function to upload a file to a pre-signed URL with progress tracking.
   * @param {string} url
   * @param {File} file
   * @param {Function} onProgress
   */
  static async uploadFileWithProgress(url, file, onProgress) {
    await axios.put(url, file, {
      headers: { "Content-Type": file.type },
      onUploadProgress: (event) => {
        if (onProgress && event.total) {
          const percent = Math.round((event.loaded * 100) / event.total);
          onProgress(percent);
        }
      },
    });
  }

  /**
   * Gets a pre-signed URL for uploading a file to S3.
   * @param {Object} param0
   * @param {string} param0.name - The name of the file.
   * @param {number} param0.size - The size of the file.
   * @param {string} param0.type - The MIME type of the file.
   * @param {Object} [param0.meta={}] - Optional metadata to associate with the file.
   * @param {Object} [param0.context={}] - Optional context object for permission checks.
   * @returns {Promise<Object>} - Object { url, fileId } containing the pre-signed URL and file ID.
   */
  async getUploadUrl({ name, size, type, meta = {}, context = {} }) {
    if (typeof name !== "string") {
      throw new Meteor.Error("invalid-name", "Invalid file name");
    }
    if (typeof size !== "number") {
      throw new Meteor.Error("invalid-size", "Invalid file size");
    }
    if (typeof type !== "string") {
      throw new Meteor.Error("invalid-type", "Invalid file type");
    }
    if (typeof meta !== "object") {
      throw new Meteor.Error("invalid-meta", "Invalid meta object");
    }
    if (typeof context !== "object") {
      throw new Meteor.Error("invalid-context", "Invalid context object");
    }
    this.log(`Getting upload URL for file: ${name}`);
    return await Meteor.callAsync(`meteorS3.${this.config.name}.getUploadUrl`, {
      name,
      size,
      type,
      meta,
      context,
    });
  }

  /**
   * Uploads a file to S3.
   *
   * Internally, this method calls `getUploadUrl` to obtain a pre-signed URL for uploading the file.
   * After the upload is complete, it calls the server method to handle the post file upload event.
   * @param {Object} params - The parameters for the upload.
   * @param {File} params.file - The file to upload.
   * @param {Object} [params.meta={}] - Optional metadata to associate with the file.
   * @param {Function} [params.onProgress] - Optional callback to track upload progress.
   * @param {Object} [params.context={}] - Optional context object, can contain data for permission checks on the server side via onCheckPermissions-Hook.
   * @returns {Promise<string>} - The ID of the uploaded file.
   * @throws {Meteor.Error} - If the upload fails.
   */
  async uploadFile({ file, meta = {}, onProgress, context = {} }) {
    if (typeof file !== "object" || !(file instanceof File)) {
      throw new Meteor.Error("invalid-file", "Invalid file object");
    }
    if (typeof meta !== "object") {
      throw new Meteor.Error("invalid-meta", "Invalid meta object");
    }
    if (typeof context !== "object") {
      throw new Meteor.Error("invalid-context", "Invalid context object");
    }
    if (onProgress && typeof onProgress !== "function") {
      throw new Meteor.Error(
        "invalid-onProgress",
        "Invalid onProgress callback"
      );
    }
    this.log(`Uploading file: ${file.name} (${file.size} bytes)`);

    const { url, fileId } = await this.getUploadUrl({
      name: file.name,
      size: file.size,
      type: file.type,
      meta,
      context,
    });

    this.log(
      `Start uploading file to S3: ${file.name} (${file.size} bytes) using URL: ${url}`
    );

    await MeteorS3Client.uploadFileWithProgress(url, file, onProgress);

    this.log(`File uploaded successfully: ${file.name} with ID: ${fileId}`);
    // This is now done by the lambda function
    /*
    false && await Meteor.callAsync(
      `meteorS3.${this.config.name}.handleFileUploadEvent`,
      fileId
    );
    this.log(`File upload event handled for ID: ${fileId}`);
    */
    return fileId;
  }

  /**
   * Gets the pre-signed URL for downloading a file from S3.
   * @param {Object} params - The parameters for the download.
   * @param {string} params.fileId - The ID of the file to download.
   * @param {Object} [params.context={}] - Optional context object, can contain data for permission checks on the server side via onCheckPermissions-Hook.
   * @returns {Promise<string>} - The pre-signed URL for downloading the file.
   * @throws {Meteor.Error} - If the download URL cannot be obtained.
   */
  async getDownloadUrl({ fileId, context = {} }) {
    if (typeof fileId !== "string") {
      throw new Meteor.Error("invalid-fileId", "Invalid file ID");
    }
    if (typeof context !== "object") {
      throw new Meteor.Error("invalid-context", "Invalid context object");
    }
    this.log(`Getting download URL for file ID: ${fileId}`);
    return await Meteor.callAsync(
      `meteorS3.${this.config.name}.getDownloadUrl`,
      { fileId, context }
    );
  }

  /**
   * Gets the metadata for a file in S3, including the s3 status (pending or uploaded).
   *
   * You can use this to wait for a file to finish uploading to s3; alternatively, you can check the status reactively
   * by setting up a publication that publishes the files state and subscribe to it in the client.
   *
   * @param {Object} params - The parameters for the metadata retrieval.
   * @param {string} params.fileId - The ID of the file to get metadata for.
   * @param {Object} [params.context={}] - Optional context object, can contain data for permission checks on the server side via onCheckPermissions-Hook.
   * @returns {Promise<Object>} - The metadata of the file, for instance the file size and MIME type and s3 status (pending or uploaded)
   * @throws {Meteor.Error} - If the metadata cannot be obtained.
   */
  async head({ fileId, context = {} }) {
    if (typeof fileId !== "string") {
      throw new Meteor.Error("invalid-fileId", "Invalid file ID");
    }
    if (typeof context !== "object") {
      throw new Meteor.Error("invalid-context", "Invalid context object");
    }
    this.log(`Getting HEAD for file ID: ${fileId}`);
    return await Meteor.callAsync(`meteorS3.${this.config.name}.head`, {
      fileId,
      context,
    });
  }

  /**
   * Downloads a file from S3 as a blob.
   * If called on the server, you get the contents, on the client, this returns a `Blob` object, so
   * you need to call the `.text()` method if the file is a text file, for example
   * @param {Object} params - The parameters for the download.
   * @param {string} params.fileId - The ID of the file to download.
   * @param {Object} [params.context={}] - Optional context object, can contain data for permission checks on the server side via onCheckPermissions-Hook.
   * @returns {Promise<Blob>} - The downloaded file as a Blob.
   * @throws {Meteor.Error} - If the download fails.
   */
  async downloadFile({ fileId, context = {} }) {
    if (typeof fileId !== "string") {
      throw new Meteor.Error("invalid-fileId", "Invalid file ID");
    }
    if (typeof context !== "object") {
      throw new Meteor.Error("invalid-context", "Invalid context object");
    }
    this.log(`Downloading file with ID: ${fileId}`);
    const url = await this.getDownloadUrl({ fileId, context });
    const res = await axios.get(url, {
      responseType: "blob", // Set response type to blob for file download
    });
    if (res.status !== 200) {
      throw new Meteor.Error(
        "file-download-failed",
        `Failed to download file: ${res.statusText}`
      );
    }

    return await res.data;
  }

  /**
   * Removes a file from S3.
   * @param {Object} params - The parameters for the file removal.
   * @param {string} params.fileId - The ID of the file to remove.
   * @param {Object} [params.context={}] - Optional context object, can contain data for permission checks on the server side via onCheckPermissions-Hook.
   * @throws {Meteor.Error} - If the file cannot be removed.
   */
  async removeFile({ fileId, context = {} }) {
    if (typeof fileId !== "string") {
      throw new Meteor.Error("invalid-fileId", "Invalid file ID");
    }
    if (typeof context !== "object") {
      throw new Meteor.Error("invalid-context", "Invalid context object");
    }
    this.log(`Removing file with ID: ${fileId}`);
    try {
      await Meteor.callAsync(`meteorS3.${this.config.name}.removeFile`, {
        fileId,
        context,
      });
      this.log(`File removed successfully: ${fileId}`);
    } catch (error) {
      throw new Meteor.Error(
        "file-remove-failed",
        `Failed to remove file: ${error.message}`
      );
    }
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
