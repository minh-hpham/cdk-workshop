import * as cdk from '@aws-cdk/core';
import * as eks from '@aws-cdk/aws-eks';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as iam from '@aws-cdk/aws-iam';

export interface BastionInstanceProps extends cdk.StackProps {
    name: string;
    vpc: ec2.Vpc;
    securityGroup: ec2.SecurityGroup;
}

export class EKSBastion extends cdk.Stack {
    public bastionInstance: ec2.BastionHostLinux
    
    constructor(scope: cdk.Construct, id: string, props: BastionInstanceProps) {
        super(scope, id, props)
        const region = cdk.Stack.of(this).region

        const host = new ec2.BastionHostLinux(this, id, {
            vpc: props.vpc,
            instanceName: props.name,
            machineImage: new ec2.AmazonLinuxImage({
                generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2, // this should have latest SSM agent installed.
            }),
            instanceType:  ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.NANO),
            subnetSelection: props.vpc.selectSubnets({subnetType: ec2.SubnetType.PUBLIC}),
            securityGroup: props.securityGroup,
        })
        
        //Add Tags to instance
        cdk.Tags.of(host).add("Name", id)
        // Inject intial script to instance user data
        host.instance.addUserData(
            "curl -o kubectl https://s3.us-west-2.amazonaws.com/amazon-eks/1.21.2/2021-07-05/bin/darwin/amd64/kubectl",
            "chmod +x ./kubectl",
            "mkdir -p $HOME/bin && cp ./kubectl $HOME/bin/kubectl && export PATH=$HOME/bin:$PATH",
            "mv ./kubectl /usr/bin",
            "curl -s https://raw.githubusercontent.com/helm/helm/master/scripts/get-helm-3 | bash -",
            "VERSION=v4.30.1 && BINARY=yq_linux_amd64 && wget https://github.com/mikefarah/yq/releases/download/${VERSION}/${BINARY}.tar.gz -O - | tar xz && mv ${BINARY} /usr/bin/yq",
            "sudo yum install jq",
            // "su -c \"aws eks update-kubeconfig --name " + cluster.clusterName + " --region " + region + "\" ssm-user",
        )
        // Add the policy to access EC2 without SSH
        host.instance.role.addManagedPolicy(
            iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore')
        )
    }
}
