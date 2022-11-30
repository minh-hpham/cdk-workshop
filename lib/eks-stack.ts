import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as eks from 'aws-cdk-lib/aws-eks';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Key } from 'aws-cdk-lib/aws-kms';
import { Construct } from 'constructs';

export interface ClusterProps extends cdk.StackProps {
    clusterName: string;
    version: eks.KubernetesVersion;
    vpc: ec2.IVpc;
    controlPlaneENISg?: ec2.ISecurityGroup;
}

export class EKSCluster extends cdk.Stack {
    public cluster: eks.Cluster;
    public bastionSecurityGroup: ec2.SecurityGroup;
    public bastionRole: iam.Role;

    constructor(scope: Construct, id: string,  props: ClusterProps) {
    // for this class to use injected info from scope and props
        super(scope, id, props)
        const accountID = cdk.Stack.of(this).account
        const region = cdk.Stack.of(this).region
        const vpc = props.vpc;
        const eniSecurityGroup = props.controlPlaneENISg? props.controlPlaneENISg : new ec2.SecurityGroup(this, "controlPlaneENISecurityGroup", {
            vpc: vpc,
        })
        eniSecurityGroup.addEgressRule(ec2.Peer.ipv4(vpc.vpcCidrBlock), ec2.Port.tcp(443), "connectivity to services running in port 443")
        eniSecurityGroup.addEgressRule(ec2.Peer.ipv4(vpc.vpcCidrBlock), ec2.Port.tcp(53), "dns connectivity tcp")        // encrypt data in etcd at rest

        const etcdEncryptionKey = new Key(this, "etcdEncryptionKey", { enabled: true })

        const workersSecuirityGroup = new ec2.SecurityGroup(this, "WorkersSG", {
            vpc: vpc,
            description: "base security group for all workers in the kubernetes cluster",
            allowAllOutbound: true,
        })
        workersSecuirityGroup.addIngressRule(workersSecuirityGroup, ec2.Port.allTraffic(), "allow any traffic between worker nodes")
        workersSecuirityGroup.addIngressRule(eniSecurityGroup, ec2.Port.tcp(443), "allow traffic to API server")
        workersSecuirityGroup.addEgressRule(ec2.Peer.ipv4(vpc.vpcCidrBlock), ec2.Port.allTcp(), "allow any tcp traffic to VPC")
        workersSecuirityGroup.addEgressRule(ec2.Peer.ipv4(vpc.vpcCidrBlock), ec2.Port.allUdp(), "allow any UDP traffic to VPC")

        this.cluster = new eks.Cluster(this, id, {
            vpc: vpc,
            clusterName: props.clusterName,
            version: props.version,
            endpointAccess: eks.EndpointAccess.PRIVATE,
            outputClusterName: true,
            outputConfigCommand: true,
            securityGroup: eniSecurityGroup,
            clusterLogging: [eks.ClusterLoggingTypes.API, eks.ClusterLoggingTypes.AUTHENTICATOR, eks.ClusterLoggingTypes.SCHEDULER],
            outputMastersRoleArn: true,
            secretsEncryptionKey: etcdEncryptionKey,
            vpcSubnets: [{subnetType: ec2.SubnetType.PRIVATE_ISOLATED}],
            defaultCapacity: 2,
            defaultCapacityInstance: ec2.InstanceType.of(ec2.InstanceClass.T2, ec2.InstanceSize.MEDIUM),
            placeClusterHandlerInVpc: true,
        })

        // to allow pod running on fargate, we need to define pod execution role and fargate profile
        // https://docs.aws.amazon.com/cdk/api/v1/docs/@aws-cdk_aws-eks.FargateProfile.html
        const AmazonEKSForFargateServiceRolePolicy = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["ecr:GetAuthorizationToken",
            "ecr:BatchCheckLayerAvailability",
            "ecr:GetDownloadUrlForLayer",
            "ecr:BatchGetImage"],
            resources: ["*"],
        })
    
        const FargateLoggingStatement = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
            'logs:CreateLogStream',
            'logs:CreateLogGroup',
            'logs:DescribeLogStreams',
            'logs:PutLogEvents'
            ],
            resources: ['*']
        })
    
        const fargatePodExecutionRole = new iam.Role(this, "AmazonEKSFargatePodExecutionRole", {
            roleName: "AmazonEKSFargatePodExecutionRole",
            assumedBy: new iam.PrincipalWithConditions(new iam.ServicePrincipal("eks-fargate-pods.amazonaws.com"),
            {"ArnLike": {"aws:SourceArn": `arn:aws:eks:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:fargateprofile/*`}}),
            inlinePolicies: {
                AmazonEKSForFargateServiceRolePolicy: new iam.PolicyDocument({
                    statements: [AmazonEKSForFargateServiceRolePolicy, FargateLoggingStatement]
                })
            },
        })
    
        this.cluster.addFargateProfile("FargateProfileAllNamespaces", {
            selectors: [{ namespace: "*" }],
            podExecutionRole: fargatePodExecutionRole,
            fargateProfileName: "FargateProfileAllNamespaces",
        })
    
        // autoscaling 
        const autoscalingGroup = this.cluster.addAutoScalingGroupCapacity("general-worker-auto-scaling-group", {
            instanceType: new ec2.InstanceType("t2.medium"),
            minCapacity: 1,
            maxCapacity: 100,
            vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
            allowAllOutbound: false
        })
        autoscalingGroup.addSecurityGroup(workersSecuirityGroup);

                // define the IAM role that will allow the EC2 instance to communicate with SSM 
        // Create Custom IAM Role and Policies for Bastion Host
        // https://docs.aws.amazon.com/eks/latest/userguide/security_iam_id-based-policy-examples.html#policy_example3
        const bastionHostPolicy = new iam.ManagedPolicy(this, 'bastionHostManagedPolicy');
        bastionHostPolicy.addStatements(new iam.PolicyStatement({
            resources: ['*'],
            actions: [
                'eks:DescribeNodegroup',
                'eks:ListNodegroups',
                'eks:DescribeCluster',
                'eks:ListClusters',
                'eks:AccessKubernetesApi',
                'eks:ListUpdates',
                'eks:ListFargateProfiles',
            ],
            effect: iam.Effect.ALLOW,
            sid: 'EKSReadonly',
        }));

        const bastionRole = new iam.Role(this, 'BastionRole', {
            roleName: "eks-bastion",
            assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
            managedPolicies: [
                // SSM Manager Permissions
                iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
                // Read only EKS Permissions
                bastionHostPolicy,
              ],
        });
        // allow bastion to access cluster as master role because i'm lazy to set up proper user and group
        this.cluster.awsAuth.addMastersRole(bastionRole, `${bastionRole.roleArn}`);
        this.bastionRole = bastionRole
        // Generating outputs
        new cdk.CfnOutput(this, 'eksBastionRoleArn', {
            description: 'eks bastion role arn',
            exportName: `ekscluster1002BastionRoleArn`,
            value: bastionRole.roleArn,
        });
    }
}