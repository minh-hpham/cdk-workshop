import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as eks from '@aws-cdk/aws-eks';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as kms from '@aws-cdk/aws-kms';

export interface ClusterProps extends cdk.StackProps {
    clusterName: string
    version: string
}

export class EKSCluster extends cdk.Stack {
    public cluster: eks.Cluster

    constructor(scope: cdk.Construct, id: string,  props?: ClusterProps) {
        // for this class to use injected info from scope and props
        super(scope, id, props)

        const accountID = cdk.Stack.of(this).account
        const region = cdk.Stack.of(this).region

        const etcdEncryptionKey = new kms.Key(this, "etcdEncryptionKey", { enabled: true })
        this.cluster = new eks.Cluster(this, 'eks-cluster', {
            clusterName: props?.clusterName,
            version: eks.KubernetesVersion.of(props? props.version : "v1_21"),
            secretsEncryptionKey: etcdEncryptionKey,
            endpointAccess: eks.EndpointAccess.PRIVATE,
            placeClusterHandlerInVpc: true,
            vpcSubnets: [{subnetType: ec2.SubnetType.PRIVATE_WITH_NAT}],
            outputClusterName: true,
            outputConfigCommand: true,
        })

        this.cluster.clusterSecurityGroup.addEgressRule(ec2.Peer.ipv4(this.cluster.vpc.vpcCidrBlock), ec2.Port.tcp(443), "connectivity to services running in port 443")
        this.cluster.clusterSecurityGroup.addIngressRule(ec2.Peer.ipv4(this.cluster.vpc.vpcCidrBlock), ec2.Port.tcp(53), "dns connectivity tcp")

        const AmazonEKSForFargateServiceRolePolicy = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions:["ecr:GetAuthorizationToken",
            "ecr:BatchCheckLayerAvailability",
            "ecr:GetDownloadUrlForLayer",
            "ecr:BatchGetImage"],
            resources: ["*"],
        })
        AmazonEKSForFargateServiceRolePolicy.addCondition("ArnLike", {
            "aws:SourceArn": `arn:aws:eks:${region}:${accountID}:fargateprofile/*`
         })
        const fargatePodExecutionRole = new iam.Role(this, "AmazonEKSFargatePodExecutionRole", {
            roleName: "AmazonEKSFargatePodExecutionRole",
            assumedBy: new iam.ServicePrincipal("eks-fargate-pods.amazonaws.com"),
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
    }
}