import https from "https";
import http from "http";
import { URL } from "url";

/**
 * Lambda-Handler für S3 ObjectCreated Events.
 * Erwartet die Umgebungsvariable WEBHOOK_URL.
 */
export const handler = async (event) => {
  console.log("Received S3 event:", JSON.stringify(event, null, 2));

  if (!process.env.WEBHOOK_URL) {
    throw new Error("WEBHOOK_URL is not set");
  }

  const webhookUrl = new URL(process.env.WEBHOOK_URL);

  // S3 liefert Records – wir nehmen den Key und optional den ETag
  const records = event.Records || [];
  const payloads = records.map(r => ({
    key: decodeURIComponent(r.s3.object.key.replace(/\+/g, " ")),
    eTag: r.s3.object.eTag
  }));

  // Für jeden Record POST an deinen Webhook
  for (const payload of payloads) {
    const body = JSON.stringify(payload);
    const isHttps = webhookUrl.protocol === "https:";

    const options = {
      hostname: webhookUrl.hostname,
      port: webhookUrl.port || (isHttps ? 443 : 80),
      path: webhookUrl.pathname + webhookUrl.search,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body)
      }
    };

    await new Promise((resolve, reject) => {
      const req = (isHttps ? https : http).request(options, (res) => {
        let data = "";
        res.on("data", chunk => (data += chunk));
        res.on("end", () => {
          console.log(`Webhook responded with status ${res.statusCode}: ${data}`);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve();
          } else {
            reject(new Error(`Webhook responded with ${res.statusCode}`));
          }
        });
      });

      req.on("error", reject);
      req.write(body);
      req.end();
    });
  }

  return { status: "ok" };
};