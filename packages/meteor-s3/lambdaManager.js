import {
  LambdaClient,
  CreateFunctionCommand,
  ListFunctionsCommand,
  GetFunctionCommand,
  UpdateFunctionCodeCommand,
  UpdateFunctionConfigurationCommand,
  AddPermissionCommand,
} from "@aws-sdk/client-lambda";
import { LogClass } from "./logClass";
import {
  GetBucketNotificationConfigurationCommand,
  PutBucketNotificationConfigurationCommand,
} from "@aws-sdk/client-s3";
import { renderTemplate } from "./helper/templates";
import crypto from "crypto";

const lambdaFunctions = ["uploadHandler"]

// --- Lambda deploy helpers -------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForLambdaReady(lambdaClient, functionName, opts = {}) {
  // check if Lambda function exists
  try {
    await lambdaClient.send(
      new GetFunctionCommand({ FunctionName: functionName })
    );
  } catch (e) {
    if (e.name === "ResourceNotFoundException") {
      return;
    }
    throw e;
  }

  const { timeoutMs = 60000, pollMs = 800 } = opts;
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const cfg = await lambdaClient.send(
        new GetFunctionCommand({ FunctionName: functionName })
      );
      const status = cfg?.Configuration?.LastUpdateStatus;

      if (!status || status === "Successful") return;
      if (status === "Failed")
        throw new Error("Lambda LastUpdateStatus=Failed");
    } catch (e) {
      // LocalStack can briefly 404 during update; tolerate and retry
      console.error(`[waitForLambdaReady] Error: ${e.message}`);
    }
    await sleep(pollMs);
  }
  throw new Error(`Timeout waiting for Lambda ${functionName} to become ready`);
}

async function withLambdaUpdateRetry(
  lambdaClient,
  fn,
  functionName,
  maxRetries = 6
) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (
        e?.name === "ResourceConflictException" ||
        e?.__type === "ResourceConflictException"
      ) {
        // another update in progress; wait and retry
        await waitForLambdaReady(lambdaClient, functionName, {
          timeoutMs: 30000,
          pollMs: 700,
        });
        continue;
      }
      throw e;
    }
  }
  // one last wait to surface a better error if still stuck
  await waitForLambdaReady(lambdaClient, functionName, {
    timeoutMs: 30000,
    pollMs: 700,
  });
  return await fn();
}
// ---------------------------------------------------------------------------

export class LambdaManager extends LogClass {
  constructor(meteorS3Instance) {
    super(
      meteorS3Instance.config.verbose,
      "LambdaManager::" + meteorS3Instance.config.name
    );
    this.meteorS3 = meteorS3Instance;

    this.lambdaClient = new LambdaClient({
      region: this.meteorS3.config.region,
      endpoint: this.meteorS3.config.endpoint,
      credentials: {
        accessKeyId: this.meteorS3.config.accessKeyId,
        secretAccessKey: this.meteorS3.config.secretAccessKey,
      },
    });

    this.log("[ensureLambdaFunctions] Lambda client created");
  }

  async init() {
    await this.ensureLambdaFunctions();
  }

  async ensureLambdaFunctions() {
    // Ensure that the Lambda function for this instance exists
    this.log("[ensureLambdaFunctions] Ensuring Lambda functions");

    for (const func of lambdaFunctions) {
      // Wait for Lambda to be ready before deploying, to avoid overlap if another startup just updated it
      try {
        this.log(
          "[ensureLambdaFunctions] Waiting for Lambda function to be ready"
        );
        await waitForLambdaReady(
          this.lambdaClient,
          `meteorS3-${this.meteorS3.config.name}-${func}`,
          { timeoutMs: 15000, pollMs: 700 }
        );
      } catch (_) {
        this.log(`Lambda function not ready: ${_}`);
      }

      this.log("[ensureLambdaFunctions] Lambda function ready");

      try {
        await this.deployLambdaFunction(func);
        this.log(
          `Lambda function ${func} for instance ${this.meteorS3.config.name} deployed successfully.`
        );
      } catch (error) {
        console.error("Error deploying Lambda function:", error);
        throw new Meteor.Error(
          "lambda-deployment-error",
          `Failed to deploy Lambda function: ${error.message}`,
          error
        );
      }
    }
  }

  async deployLambdaFunction(_key) {
    const manifestTemplate = await Assets.getTextAsync(
      "private/lambda/uploadHandler/manifest.tpl.json"
    );

    // Determine a webhook base URL that is reachable from the Lambda runtime.
    // In LocalStack (Docker), 'localhost' would resolve inside the container, not your host app.
    // Prefer an explicit config override, else use host.docker.internal for local endpoints.
    const defaultBase = Meteor.absoluteUrl().replace(/\/$/, "");
    const isLocalEndpoint = !!(
      this.meteorS3.config.endpoint &&
      this.meteorS3.config.endpoint.includes("localhost")
    );
    const webhookBase = this.meteorS3.config.webhookBaseUrl
      ? this.meteorS3.config.webhookBaseUrl.replace(/\/$/, "")
      : isLocalEndpoint
        ? `http://host.docker.internal:${process.env.PORT || 3000}`
        : defaultBase;

    const webhookUrl = `${webhookBase}/meteor-s3-api/${encodeURIComponent(this.meteorS3.config.name)}/confirm`;

    const manifestString = renderTemplate(manifestTemplate, {
      INSTANCE: this.meteorS3.config.name,
      WEBHOOK_URL: webhookUrl,
      ROLE_ARN: this.meteorS3.IAMManager.lambdaRoleArn,
    });

    const manifest = JSON.parse(manifestString);

    this.log("read and rendered manifest", manifest);

    // Read the Lambda function code from the specified directory
    const functionCode = await Assets.getBinaryAsync(
      "private/lambda/uploadHandler/src.zip"
    );

    // Helper to hash current code zip
    const localCodeSha256 = crypto
      .createHash("sha256")
      .update(Buffer.from(functionCode))
      .digest("base64");

    let existingFunction = null;
    try {
      existingFunction = await this.lambdaClient.send(
        new GetFunctionCommand({ FunctionName: manifest.FunctionName })
      );
    } catch (e) {
      if (e?.name !== "ResourceNotFoundException") {
        this.log("Unexpected error checking existing Lambda", e);
        throw e;
      }
    }

    // List functions only in verbose/debug scenarios

    const result = await this.lambdaClient.send(
      new ListFunctionsCommand({ MaxItems: 5 })
    );
    this.log(
      "(Debug) First functions:",
      (result.Functions || []).map((f) => f.FunctionName)
    );

    if (!existingFunction) {
      // Create new function
      const params = {
        FunctionName: manifest.FunctionName,
        Code: { ZipFile: Buffer.from(functionCode) },
        Role: manifest.Role || this.IAMManager.lambdaRoleArn,
        Handler: manifest.Handler || "index.handler",
        Runtime: manifest.Runtime || "nodejs20.x",
        MemorySize: manifest.MemorySize || 128,
        Timeout: manifest.Timeout || 10,
        Environment: {
          Variables: {
            WEBHOOK_URL: webhookUrl,
            BUCKET: this.meteorS3.bucketName,
            INSTANCE: this.meteorS3.config.name,
          },
        },
      };
      this.log(
        `Creating Lambda function ${manifest.FunctionName} (new deployment)`
      );
      await this.lambdaClient.send(new CreateFunctionCommand(params));
      await waitForLambdaReady(this.lambdaClient, manifest.FunctionName);
      this.log(`Lambda function ${manifest.FunctionName} created.`);
    } else {
      // Compare & update
      const currentCfg = existingFunction.Configuration || {};
      const updatesNeeded = [];

      // Code update if hash differs
      if (currentCfg.CodeSha256 !== localCodeSha256) {
        updatesNeeded.push("code");
        this.log(
          `Code update required for ${manifest.FunctionName} (remote hash ${currentCfg.CodeSha256} != local ${localCodeSha256})`
        );
        await withLambdaUpdateRetry(
          this.lambdaClient,
          () =>
            this.lambdaClient.send(
              new UpdateFunctionCodeCommand({
                FunctionName: manifest.FunctionName,
                ZipFile: Buffer.from(functionCode),
                Publish: false,
              })
            ),
          manifest.FunctionName
        );
        await waitForLambdaReady(this.lambdaClient, manifest.FunctionName);
      } else {
        this.log(`Code is up-to-date for ${manifest.FunctionName}`);
      }

      // Configuration differences
      const desiredEnv = {
        WEBHOOK_URL: webhookUrl,
        BUCKET: this.meteorS3.bucketName,
        INSTANCE: this.meteorS3.config.name,
      };

      const currentEnv = currentCfg.Environment?.Variables || {};
      const configDiff =
        currentCfg.MemorySize !== (manifest.MemorySize || 128) ||
        currentCfg.Timeout !== (manifest.Timeout || 10) ||
        currentCfg.Handler !== (manifest.Handler || "index.handler") ||
        currentCfg.Runtime !== (manifest.Runtime || "nodejs20.x") ||
        JSON.stringify(currentEnv) !== JSON.stringify(desiredEnv) ||
        (manifest.Role && currentCfg.Role !== manifest.Role); // Role change allowed

      if (configDiff) {
        updatesNeeded.push("configuration");
        await withLambdaUpdateRetry(
          this.lambdaClient,
          () =>
            this.lambdaClient.send(
              new UpdateFunctionConfigurationCommand({
                FunctionName: manifest.FunctionName,
                Handler: manifest.Handler || "index.handler",
                Runtime: manifest.Runtime || "nodejs20.x",
                MemorySize: manifest.MemorySize || 128,
                Timeout: manifest.Timeout || 10,
                Role: manifest.Role || currentCfg.Role,
                Environment: { Variables: desiredEnv },
              })
            ),
          manifest.FunctionName
        );
        await waitForLambdaReady(this.lambdaClient, manifest.FunctionName);
      }

      if (updatesNeeded.length === 0) {
        this.log(
          `Lambda function ${manifest.FunctionName} is up-to-date (no changes).`
        );
      } else {
        this.log(
          `Updated Lambda function ${manifest.FunctionName}: ${updatesNeeded.join(
            ", "
          )}`
        );
      }
    }

    await this.ensureS3UploadTrigger(manifest.FunctionName);
  }

  async ensureS3UploadTrigger(functionName) {
    // 0) Warten bis Lambda wirklich aktiv ist (State=Active + LastUpdateStatus=Successful)
    const waitReady = async () => {
      const timeoutMs = 60000;
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const { Configuration: c } = await this.lambdaClient.send(
          new GetFunctionCommand({ FunctionName: functionName })
        );
        const state = c?.State; // "Active" | "Pending" | ...
        const lus = c?.LastUpdateStatus; // "Successful" | "InProgress" | "Failed"
        if ((state === "Active" || !state) && (lus === "Successful" || !lus))
          return;
        await new Promise((r) => setTimeout(r, 800));
      }
      throw new Error(`Lambda ${functionName} not ready for S3 trigger`);
    };
    await waitReady();

    // 1) AddPermission für S3 -> Lambda
    const { Configuration } = await this.lambdaClient.send(
      new GetFunctionCommand({ FunctionName: functionName })
    );
    const lambdaArn = Configuration.FunctionArn;

    try {
      await this.lambdaClient.send(
        new AddPermissionCommand({
          Action: "lambda:InvokeFunction",
          FunctionName: functionName,
          Principal: "s3.amazonaws.com",
          StatementId: `s3invoke-${this.meteorS3.bucketName}`.slice(0, 100),
          SourceArn: `arn:aws:s3:::${this.meteorS3.bucketName}`,
        })
      );
      this.log(`[ensureS3UploadTrigger] AddPermission ok for ${functionName}`);
    } catch (e) {
      if (e.name !== "ResourceConflictException") throw e;
      this.log("[ensureS3UploadTrigger] Permission already exists");
    }

    // 2) Notification konfigurieren – mit Retry, falls Lambda noch nicht validierbar ist
    const desired = {
      Id: `uploads-${functionName}`.slice(0, 50),
      LambdaFunctionArn: lambdaArn,
      Events: ["s3:ObjectCreated:*"],
      Filter: { Key: { FilterRules: [{ Name: "prefix", Value: "uploads/" }] } },
    };

    const putWithRetry = async () => {
      const max = 8;
      for (let i = 0; i < max; i++) {
        const current = await this.meteorS3.s3Client.send(
          new GetBucketNotificationConfigurationCommand({
            Bucket: this.meteorS3.bucketName,
          })
        );
        const existing = current.LambdaFunctionConfigurations || [];
        const filtered = existing.filter(
          (c) =>
            !(
              c.LambdaFunctionArn === desired.LambdaFunctionArn &&
              c.Id === desired.Id
            )
        );
        const merged = [...filtered, desired];

        try {
          await this.meteorS3.s3Client.send(
            new PutBucketNotificationConfigurationCommand({
              Bucket: this.meteorS3.bucketName,
              NotificationConfiguration: {
                LambdaFunctionConfigurations: merged,
                QueueConfigurations: current.QueueConfigurations || [],
                TopicConfigurations: current.TopicConfigurations || [],
              },
            })
          );
          return;
        } catch (e) {
          // InvalidArgument/ResourceConflict -> kurz warten und erneut
          if (
            e.name === "InvalidArgument" ||
            e.name === "ResourceConflictException"
          ) {
            await new Promise((r) => setTimeout(r, 1000 * Math.min(1 + i, 5)));
            continue;
          }
          throw e;
        }
      }
      throw new Error("Failed to set S3 notification after retries");
    };

    await putWithRetry();

    // 3) Verifizieren
    const verify = await this.meteorS3.s3Client.send(
      new GetBucketNotificationConfigurationCommand({
        Bucket: this.meteorS3.bucketName,
      })
    );
    const ok = (verify.LambdaFunctionConfigurations || []).some(
      (c) =>
        c.LambdaFunctionArn === desired.LambdaFunctionArn && c.Id === desired.Id
    );
    if (!ok) {
      throw new Error(
        "[ensureS3UploadTrigger] Verification failed – trigger not present"
      );
    }
    this.log(
      "[ensureS3UploadTrigger] S3 notification configured for prefix 'uploads/'"
    );
  }
}
