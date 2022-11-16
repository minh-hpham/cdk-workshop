import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as eks from '@aws-cdk/aws-eks';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as kms from '@aws-cdk/aws-kms';

export interface ClusterProps extends cdk.StackProps {
    clusterName: string;
    version: eks.KubernetesVersion;
}

export class EKSCluster extends cdk.Stack {
    public cluster: eks.Cluster;
    public vpc: any;
    public bastionSecurityGroup: ec2.SecurityGroup;

    constructor(scope: cdk.Construct, id: string,  props: ClusterProps) {
        // for this class to use injected info from scope and props
        super(scope, id, props)

        const accountID = cdk.Stack.of(this).account
        const region = cdk.Stack.of(this).region

        // encrypt data in etcd at rest
        const etcdEncryptionKey = new kms.Key(this, "etcdEncryptionKey", { enabled: true })
        this.cluster = new eks.Cluster(this, 'eks-cluster', {
            clusterName: props?.clusterName,
            version: props? props.version : eks.KubernetesVersion.V1_21,
            secretsEncryptionKey: etcdEncryptionKey,
            endpointAccess: eks.EndpointAccess.PRIVATE,
            placeClusterHandlerInVpc: true,
            vpcSubnets: [{subnetType: ec2.SubnetType.PRIVATE_WITH_NAT}],
            outputClusterName: true,
            outputConfigCommand: true,
        })

        this.cluster.clusterSecurityGroup.addEgressRule(ec2.Peer.ipv4(this.cluster.vpc.vpcCidrBlock), ec2.Port.tcp(443), "connectivity to services running in port 443")
        this.cluster.clusterSecurityGroup.addIngressRule(ec2.Peer.ipv4(this.cluster.vpc.vpcCidrBlock), ec2.Port.tcp(53), "dns connectivity tcp")

        // to allow pod running on fargate, we need to define pod execution role and fargate profile
        // https://docs.aws.amazon.com/cdk/api/v1/docs/@aws-cdk_aws-eks.FargateProfile.html
        const AmazonEKSForFargateServiceRolePolicy = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions:["ecr:GetAuthorizationToken",
            "ecr:BatchCheckLayerAvailability",
            "ecr:GetDownloadUrlForLayer",
            "ecr:BatchGetImage"],
            resources: ["*"],
        })
        const fargatePodExecutionRole = new iam.Role(this, "AmazonEKSFargatePodExecutionRole", {
            roleName: "AmazonEKSFargatePodExecutionRole",
            assumedBy: new iam.PrincipalWithConditions(new iam.ServicePrincipal("eks-fargate-pods.amazonaws.com"),
                {"ArnLike": {"aws:SourceArn": `arn:aws:eks:${region}:${accountID}:fargateprofile/*`}}),
            inlinePolicies: {
                AmazonEKSForFargateServiceRolePolicy: new iam.PolicyDocument({
                    statements: [AmazonEKSForFargateServiceRolePolicy]
                })
            }
        })

        this.cluster.addFargateProfile("FargateProfileAllNamespaces", {
            selectors: [{namespace: "*"}],
            podExecutionRole: fargatePodExecutionRole,
            fargateProfileName: "FargateProfileAllNamespaces"
        })

        this.vpc = this.cluster.vpc

        this.bastionSecurityGroup = new ec2.SecurityGroup(this, `${id}-SecurityGroup`, {
            vpc: this.vpc,
            description: "Security group for the bastion, no inbound open because we should access the bastion via AWS SSM",
            allowAllOutbound: true
        })
        this.cluster.clusterSecurityGroup.addIngressRule(
            this.bastionSecurityGroup,
            ec2.Port.allTraffic()
        )

    }

}
