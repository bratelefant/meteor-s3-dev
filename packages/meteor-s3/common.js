import axios from "axios";

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
  constructor(instanceName) {
    this.instanceName = instanceName;
  }

  /**
   * Uploads a file to S3.
   * @param {File} file - The file to upload.
   * @param {Object} [meta={}] - Optional metadata to associate with the file.
   * @param {Function} [onProgress] - Optional callback to track upload progress.
   * @returns {Promise<string>} - The ID of the uploaded file.
   * @throws {Meteor.Error} - If the upload fails.
   */
  async uploadFile(file, meta = {}, onProgress) {
    const { url, fileId } = await Meteor.callAsync(
      `meteorS3.${this.instanceName}.getUploadUrl`,
      { name: file.name, size: file.size, type: file.type, meta }
    );

    await uploadFileWithProgress(url, file, onProgress);
    // After the upload, we need to call the server method to handle the file upload event
    await Meteor.callAsync(
      `meteorS3.${this.instanceName}.handleFileUploadEvent`,
      fileId
    );
    return fileId;
  }

  /**
   * Gets the pre-signed URL for downloading a file from S3.
   * @param {string} fileId - The ID of the file to download.
   * @returns {Promise<string>} - The pre-signed URL for downloading the file.
   * @throws {Meteor.Error} - If the download URL cannot be obtained.
   */
  async getDownloadUrl(fileId) {
    return await Meteor.callAsync(
      `meteorS3.${this.instanceName}.getDownloadUrl`,
      fileId
    );
  }

  /**
   * Downloads a file from S3 as a blob.
   * @param {string} fileId - The ID of the file to download.
   * @returns {Promise<Blob>} - The downloaded file as a Blob.
   * @throws {Meteor.Error} - If the download fails.
   */
  async downloadFile(fileId) {
    const url = await this.getDownloadUrl(fileId);
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
}
