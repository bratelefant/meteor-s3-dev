import {
  IAMClient,
  GetRoleCommand,
  CreateRoleCommand,
  UpdateAssumeRolePolicyCommand,
  AttachRolePolicyCommand,
  PutRolePolicyCommand,
  GetRolePolicyCommand,
} from "@aws-sdk/client-iam";

export class IAMManager {
  constructor(config) {
    this.config = config;
    this.IAMClient = new IAMClient({
      region: this.config.region,
      credentials: {
        accessKeyId: this.config.accessKeyId,
        secretAccessKey: this.config.secretAccessKey,
      },
      endpoint: this.config.endpoint, // optional (LocalStack)
    });
  }

  async init() {
    await this.ensureLambdaExecRole();
  }

  async ensureLambdaExecRole() {
    const roleName = `MeteorS3LambdaExecRole-${this.config.name}`;
    const trustPolicy = {
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Principal: { Service: "lambda.amazonaws.com" },
          Action: "sts:AssumeRole",
        },
      ],
    };

    // get or create role
    let roleArn;
    try {
      const { Role } = await this.IAMClient.send(
        new GetRoleCommand({ RoleName: roleName })
      );
      roleArn = Role.Arn;
      await this.IAMClient.send(
        new UpdateAssumeRolePolicyCommand({
          RoleName: roleName,
          PolicyDocument: JSON.stringify(trustPolicy),
        })
      );
      this.log(`[ensureRoles] Role exists: ${roleName}`);
    } catch (e) {
      if (e.name !== "NoSuchEntityException") throw e;
      const { Role } = await this.IAMClient.send(
        new CreateRoleCommand({
          RoleName: roleName,
          AssumeRolePolicyDocument: JSON.stringify(trustPolicy),
          Description: `Execution role for MeteorS3 (${this.config.name})`,
        })
      );
      roleArn = Role.Arn;
      this.log(`[ensureRoles] Role created: ${roleName}`);
    }

    this.log("[ensureRoles] Role exists");
    // attach CloudWatch logs policy
    try {
      await this.IAMClient.send(
        new AttachRolePolicyCommand({
          RoleName: roleName,
          PolicyArn:
            "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
        })
      );
    } catch (e) {
      this.log(
        `[ensureRoles] Error attaching CloudWatch logs policy: ${e.message}`
      );
    }

    this.log("[ensureRoles] CloudWatch logs policy attached");
    // least-privilege S3 Inline-Policy (auf deinen Bucket)
    const inlineName = `MeteorS3-S3Access-${this.config.name}-${this.bucketName}`;
    const s3Policy = {
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: [
            "s3:PutObject",
            "s3:GetObject",
            "s3:HeadObject",
            "s3:DeleteObject",
          ],
          Resource: `arn:aws:s3:::${this.bucketName}/*`,
        },
        {
          Effect: "Allow",
          Action: ["s3:ListBucket"],
          Resource: `arn:aws:s3:::${this.bucketName}`,
        },
      ],
    };

    this.log("[ensureRoles] S3 inline policy defined");
    // idempotent schreiben
    try {
      const { PolicyDocument } = await this.IAMClient.send(
        new GetRolePolicyCommand({ RoleName: roleName, PolicyName: inlineName })
      );
      const current = JSON.parse(decodeURIComponent(PolicyDocument));
      if (JSON.stringify(current) !== JSON.stringify(s3Policy)) {
        await this.IAMClient.send(
          new PutRolePolicyCommand({
            RoleName: roleName,
            PolicyName: inlineName,
            PolicyDocument: JSON.stringify(s3Policy),
          })
        );
      }
    } catch (e) {
      if (e.name === "NoSuchEntityException") {
        await this.IAMClient.send(
          new PutRolePolicyCommand({
            RoleName: roleName,
            PolicyName: inlineName,
            PolicyDocument: JSON.stringify(s3Policy),
          })
        );
      } else {
        throw e;
      }
    }

    this.log("[ensureRoles] S3 inline policy defined ready");

    this.lambdaRoleArn = roleArn;
  }

  /**
   * Log messages if verbose mode is enabled.
   * @param {...any} args - The arguments to log.
   */
  log(...args) {
    if (this.config.verbose) {
      // eslint-disable-next-line no-console
      console.log(`IamManager::[${this.config.name}]`, ...args);
    }
  }
}
