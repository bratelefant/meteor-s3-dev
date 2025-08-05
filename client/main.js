import { MeteorS3Client } from "meteor/bratelefant:meteor-s3/common";

// Initialize the S3 client
const s3Client = new MeteorS3Client({ name: "publicFiles", verbose: true });

// Store uploaded file IDs for easy testing
const uploadedFiles = [];

// Function to handle file upload
async function handleFileUpload(event) {
  event.preventDefault();

  const statusDiv = document.getElementById("upload-status");
  const resultDiv = document.getElementById("upload-result");

  statusDiv.innerHTML = "Uploading...";
  statusDiv.style.color = "blue";
  resultDiv.innerHTML = "";

  const formData = new FormData(event.target);
  const file = formData.get("file");

  if (!file) {
    statusDiv.innerHTML = "Please select a file";
    statusDiv.style.color = "red";
    return;
  }

  try {
    const fileId = await s3Client.uploadFile(file, {}, (progress) => {
      statusDiv.innerHTML = `Uploading... ${progress}%`;
    });
    console.log(`File uploaded successfully with ID: ${fileId}`);

    // Update UI
    statusDiv.innerHTML = "Upload successful!";
    statusDiv.style.color = "green";
    resultDiv.innerHTML = `<strong>File ID:</strong> ${fileId}<br><strong>Original filename:</strong> ${file.name}`;

    // Add to uploaded files list
    uploadedFiles.push({
      id: fileId,
      name: file.name,
      uploadTime: new Date().toLocaleString(),
    });
    updateUploadedFilesList();

    // Clear the form
    event.target.reset();
  } catch (error) {
    console.error("Error uploading file:", error);
    statusDiv.innerHTML = `Upload failed: ${error.message}`;
    statusDiv.style.color = "red";
  }
}

// Function to handle file download
async function handleFileDownload(fileId) {
  const statusDiv = document.getElementById("download-status");

  if (!fileId) {
    statusDiv.innerHTML = "Please enter a file ID";
    statusDiv.style.color = "red";
    return;
  }

  statusDiv.innerHTML = "Getting download URL...";
  statusDiv.style.color = "blue";

  try {
    const downloadUrl = await s3Client.getDownloadUrl(fileId);
    console.log(`Download URL for file ${fileId}: ${downloadUrl}`);

    statusDiv.innerHTML = "Opening file in new tab!";
    statusDiv.style.color = "green";

    // Open the file in a new tab
    window.open(downloadUrl, '_blank');
  } catch (error) {
    console.error("Error downloading file:", error);
    statusDiv.innerHTML = `Download failed: ${error.message}`;
    statusDiv.style.color = "red";
  }
}

// Function to update the uploaded files list
function updateUploadedFilesList() {
  const list = document.getElementById("uploaded-files-list");
  list.innerHTML = "";

  uploadedFiles.forEach((file) => {
    const listItem = document.createElement("li");
    listItem.innerHTML = `
      <strong>${file.name}</strong> (ID: ${file.id})<br>
      <small>Uploaded: ${file.uploadTime}</small>
      <button onclick="downloadFile('${file.id}')" style="margin-left: 10px;">Download</button>
    `;
    list.appendChild(listItem);
  });
}

// Global function for download buttons
window.downloadFile = function (fileId) {
  handleFileDownload(fileId);
};

// Wait for DOM to be ready
document.addEventListener("DOMContentLoaded", function () {
  // Set up upload form event listener
  const uploadForm = document.getElementById("upload-form");
  if (uploadForm) {
    uploadForm.addEventListener("submit", handleFileUpload);
  }

  // Set up download button event listener
  const downloadBtn = document.getElementById("download-btn");
  if (downloadBtn) {
    downloadBtn.addEventListener("click", function () {
      const fileId = document.getElementById("file-id-input").value.trim();
      handleFileDownload(fileId);
    });
  }
});
