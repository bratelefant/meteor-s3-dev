import {
  IAMClient,
  GetRoleCommand,
  CreateRoleCommand,
  UpdateAssumeRolePolicyCommand,
  AttachRolePolicyCommand,
  PutRolePolicyCommand,
  GetRolePolicyCommand,
} from "@aws-sdk/client-iam";
import { LogClass } from "./logClass";

export class IAMManager extends LogClass {
  constructor(meteorS3Instance) {
    super(
      meteorS3Instance.config.verbose,
      "IAMManager::" + meteorS3Instance.config.name
    );
    this.meteorS3 = meteorS3Instance;
    this.IAMClient = new IAMClient({
      region: this.meteorS3.config.region,
      credentials: {
        accessKeyId: this.meteorS3.config.accessKeyId,
        secretAccessKey: this.meteorS3.config.secretAccessKey,
      },
      endpoint: this.meteorS3.config.endpoint, // optional (LocalStack)
    });
  }

  async init() {
    await this.ensureLambdaExecRole();
  }

  async ensureLambdaExecRole() {
    const roleName = `MeteorS3LambdaExecRole-${this.meteorS3.config.name}`;
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
          Description: `Execution role for MeteorS3 (${this.meteorS3.config.name})`,
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
    const inlineName = `MeteorS3-S3Access-${this.meteorS3.config.name}-${this.meteorS3.bucketName}`;
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
          Resource: `arn:aws:s3:::${this.meteorS3.bucketName}/*`,
        },
        {
          Effect: "Allow",
          Action: ["s3:ListBucket"],
          Resource: `arn:aws:s3:::${this.meteorS3.bucketName}`,
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
}
