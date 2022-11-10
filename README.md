# Welcome to your CDK TypeScript project

You should explore the contents of this project. It demonstrates a CDK app with an instance of a stack (`CdkWorkshopStack`)
which contains an Amazon SQS queue that is subscribed to an Amazon SNS topic.

The `cdk.json` file tells the CDK Toolkit how to execute your app.

## Useful commands

* `npm run build`   compile typescript to js
* `npm run watch`   watch for changes and compile
* `npm run test`    perform the jest unit tests
* `cdk deploy`      deploy this stack to your default AWS account/region
* `cdk diff`        compare deployed stack with current state
* `cdk synth`       emits the synthesized CloudFormation template
* `cdk bootstrap`   The first time you deploy an AWS CDK app into an environment (account/region), you'll need to install a "bootstrap stack".

## Troubleshooting

* ` ❌ Deployment failed: Error: Stack Deployments Failed: SignatureDoesNotMatch: Signature expired: 20221110T044729Z is now earlier than 20221110T140749Z (20221110T142249Z - 15 min.)`

The signature mismatch is because authentication process depends on clock syncronisation. Update clock on your local to fix: `sudo ntpdate ntp.ubuntu.com`