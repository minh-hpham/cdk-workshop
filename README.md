# Welcome to your CDK TypeScript project

You should explore the contents of this project. It demonstrates a CDK app with an instance of a stack (`CdkWorkshopStack`)
which contains an Amazon SQS queue that is subscribed to an Amazon SNS topic.

The `cdk.json` file tells the CDK Toolkit how to execute your app.

* Create  VPC in us-east-1
* create three private subnets
* Remove any internet or NAT gateway associated with the VPC
* Create the following VPC endpoints with the default security group of the VPC
    * ec2
    * lambda
    * sts
    * cloud formation
    * ssm
    * ssm-messages
    * ssm-ec2-messages
    * emr containers
    * s3 (gateway)
    * ecr.api
    * ecr.dkr
    * logs
* Remove inboud rule from default security group of the VPC otherwise EKS cluster wont be able to talk to vpc endpoints
    * add Inbound rule from anywhere within the VPC for port 443


## Useful commands

* `npm run build`   compile typescript to js
* `npm run watch`   watch for changes and compile
* `npm run test`    perform the jest unit tests
* `cdk deploy`      deploy this stack to your default AWS account/region
* `cdk diff`        compare deployed stack with current state
* `cdk synth`       emits the synthesized CloudFormation template
* `cdk bootstrap`   The first time you deploy an AWS CDK app into an environment (account/region), you'll need to install a "bootstrap stack".

## Bastion host

ec2 instance. Remember to [install session manager plugin](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html) in your local machine to start a session on this host.

```
aws ssm start-session --target $BASTION_INSTANCE_ID --region=$AWS_REGION
```

## Troubleshooting

* ` ❌ Deployment failed: Error: Stack Deployments Failed: SignatureDoesNotMatch: Signature expired: 20221110T044729Z is now earlier than 20221110T140749Z (20221110T142249Z - 15 min.)`

The signature mismatch is because authentication process depends on clock syncronisation. Update clock on your local to fix: `sudo ntpdate ntp.ubuntu.com`