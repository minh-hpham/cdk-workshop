import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam'

export interface BastionInstanceProps extends cdk.StackProps {
    vpc: ec2.IVpc;
    role: iam.Role;
}

export class BastionStack extends cdk.Stack {
    constructor(scope: cdk.App, id: string, props: BastionInstanceProps) {
        super(scope, id, props);

        const vpc = props.vpc;
        // define a user data script to install & launch our web server 
        const ssmaUserData = ec2.UserData.forLinux();
        // make sure the latest SSM Agent is installed.
        const SSM_AGENT_RPM = 'https://s3.amazonaws.com/ec2-downloads-windows/SSMAgent/latest/linux_amd64/amazon-ssm-agent.rpm';
        ssmaUserData.addCommands(`sudo yum install -y ${SSM_AGENT_RPM}`, 'restart amazon-ssm-agent');
        // install and start Nginx
        ssmaUserData.addCommands('yum install -y nginx', 'chkconfig nginx on', 'service nginx start');
        ssmaUserData.addCommands("curl -o kubectl curl -o kubectl https://s3.us-west-2.amazonaws.com/amazon-eks/1.21.14/2022-10-31/bin/linux/amd64/kubectl", 
            "chmod +x ./kubectl",
            "mv ./kubectl /usr/bin",
            "curl -s https://raw.githubusercontent.com/helm/helm/master/scripts/get-helm-3 | bash -",
            "VERSION=v4.30.1 && BINARY=yq_linux_amd64 && wget https://github.com/mikefarah/yq/releases/download/${VERSION}/${BINARY}.tar.gz -O - | tar xz && mv ${BINARY} /usr/bin/yq",
            "sudo yum install jq",
            "curl -Lo aws-iam-authenticator https://github.com/kubernetes-sigs/aws-iam-authenticator/releases/download/v0.5.9/aws-iam-authenticator_0.5.9_linux_amd64",
            "chmod +x aws-iam-authenticator",
            "mv ./aws-iam-authenticator /usr/bin",
        )

        // create the instance
        // doesn't need security group because ec2 instances resides on vpc and kubectl only talks to port 443 of the control plane ENI.
        // this has been allowed in the control plane ENI's security group.
        new ec2.Instance(this, id, {
            instanceName: "eks-bastion",
            vpc:  vpc,
            vpcSubnets: {
                subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
            },
            instanceType: ec2.InstanceType.of(
                ec2.InstanceClass.T3,
                ec2.InstanceSize.MICRO,
            ),
            machineImage: new ec2.AmazonLinuxImage({
                generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
            }),
            userData: ssmaUserData,
            role: props.role, // instance profile is created internally
        })

    }}