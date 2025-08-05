import axios from "axios";
import { clientConfigSchema } from "./schemas/config";
import { check, Match } from "meteor/check";

async function uploadFileWithProgress(url, file, onProgress) {
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
 * Meteor S3 Client
 * This class provides methods to interact with S3 for file uploads and downloads.
 * It uses Meteor's callAsync method to communicate with the server-side methods.
 * It supports uploading files, getting download URLs, downloading files as blobs, and opening files in a new tab.
 */
export class MeteorS3Client {
  constructor(config) {
    if (typeof config === "string") {
      // If a string is passed, treat it as the instance name
      config = { name: config, verbose: false };
    }
    // Validate the configuration against the client schema
    clientConfigSchema.validate(config);
    this.config = config;

    this.log(`Initializing MeteorS3Client for instance: ${this.config.name}`);
  }

  /**
   * Uploads a file to S3.
   * @param {File} file - The file to upload.
   * @param {Object} [meta={}] - Optional metadata to associate with the file.
   * @param {Function} [onProgress] - Optional callback to track upload progress.
   * @param {Object} [context={}] - Optional context object, can contain data for permission checks on the server side via onCheckPermissions-Hook.
   * @returns {Promise<string>} - The ID of the uploaded file.
   * @throws {Meteor.Error} - If the upload fails.
   */
  async uploadFile(file, meta = {}, onProgress, context = {}) {
    check(file, File);
    check(meta, Object);
    check(context, Object);
    check(onProgress, Match.Maybe(Function));
    this.log(`Uploading file: ${file.name} (${file.size} bytes)`);

    const { url, fileId } = await Meteor.callAsync(
      `meteorS3.${this.config.name}.getUploadUrl`,
      { name: file.name, size: file.size, type: file.type, meta, context }
    );

    this.log(
      `Start uploading file to S3: ${file.name} (${file.size} bytes) using URL: ${url}`
    );

    await uploadFileWithProgress(url, file, onProgress);

    this.log(`File uploaded successfully: ${file.name} with ID: ${fileId}`);
    // After the upload, we need to call the server method to handle the file upload event
    await Meteor.callAsync(
      `meteorS3.${this.config.name}.handleFileUploadEvent`,
      fileId
    );
    this.log(`File upload event handled for ID: ${fileId}`);
    return fileId;
  }

  /**
   * Gets the pre-signed URL for downloading a file from S3.
   * @param {string} fileId - The ID of the file to download.
   * @param {Object} [context={}] - Optional context object, can contain data for permission checks on the server side via onCheckPermissions-Hook.
   * @returns {Promise<string>} - The pre-signed URL for downloading the file.
   * @throws {Meteor.Error} - If the download URL cannot be obtained.
   */
  async getDownloadUrl(fileId, context = {}) {
    check(fileId, String);
    check(context, Object);
    this.log(`Getting download URL for file ID: ${fileId}`);
    return await Meteor.callAsync(
      `meteorS3.${this.config.name}.getDownloadUrl`,
      { fileId, context }
    );
  }

  /**
   * Downloads a file from S3 as a blob.
   * @param {string} fileId - The ID of the file to download.
   * @returns {Promise<Blob>} - The downloaded file as a Blob.
   * @throws {Meteor.Error} - If the download fails.
   */
  async downloadFile(fileId, context = {}) {
    check(fileId, String);
    check(context, Object);
    this.log(`Downloading file with ID: ${fileId}`);
    const url = await this.getDownloadUrl(fileId, context);
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
   * Log messages if verbose mode is enabled.
   * @param {...any} args - The arguments to log.
   */
  log(...args) {
    if (this.config.verbose) {
      console.log(`MeteorS3::[${this.config.name}]`, ...args);
    }
  }
}
