const AWS = require("aws-sdk");
const S3 = new AWS.S3();
const sharp = require("sharp");

const validExtensions = [
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".tif",
  ".tiff",
];

const isImage = (key) => {
  return validExtensions.some((ext) => key.toLowerCase().endsWith(ext));
};

const thumbnailSizes =
  process.env.THUMBNAIL_SIZES ||
  JSON.stringify([
    { name: "tiny", meta: { width: 25, height: 25 } },
    { name: "small", meta: { width: 50, height: 50 } },
    { name: "medium", meta: { width: 100, height: 100 } },
    { name: "large", meta: { width: 250, height: 250 } },
  ]);

const sizes = JSON.parse(thumbnailSizes);

exports.handler = async (event) => {
  const record = event.Records[0];
  const bucket = record.s3.bucket.name;

  const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));

  if (!key.startsWith("uploads/") || !isImage(key)) {
    console.log("cannot process file:", key);
    return;
  }

  if (!process.env.WEBHOOK_URL) {
    console.log("WEBHOOK_URL is not set");
    return;
  }

  try {
    const originalObject = await S3.getObject({
      Bucket: bucket,
      Key: key,
    }).promise();
    const filename = key.split("/").pop();

    await Promise.all(
      sizes.map(async ({ name, meta: { width, height } }) => {
        const buffer = await sharp(originalObject.Body)
          .rotate()
          .resize(width, height, {
            fit: "cover",
            position: "center",
          })
          .toFormat("jpeg")
          .toBuffer();

        const thumbKey = `thumbnails/key/${name}.jpeg`;

        const result = await S3.putObject({
          Bucket: bucket,
          Key: thumbKey,
          Body: buffer,
          ContentType: "image/jpeg",
        }).promise();

        console.log(`thumbnail saved: ${thumbKey}`);
      })
    );

    console.log(
      "generated all thumbnails, sending notification to backend",
      bucket
    );

    await fetch(process.env.WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        key: record.s3.object.key,
        etag: originalObject.ETag,
        sizes,
      }),
    });
  } catch (err) {
    console.error("💥 Fehler beim Verarbeiten:", err);
    throw err;
  }
};
