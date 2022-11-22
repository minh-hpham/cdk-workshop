import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

export interface VpcConfigProps extends cdk.StackProps {
    cidr?: string;
    maxAZs?: number;
    isolatedSubnetCidrMask?: number;
    privateSubnetCidrMask?: number;
    publicSubnetCidrMask?: number;
}

export class VPCStack extends cdk.Stack {
    public vpc: ec2.IVpc;
    public eniSecurityGroup: ec2.ISecurityGroup;

    constructor(scope: Construct, id: string, vpcConfig: VpcConfigProps) {
        super(scope, id, vpcConfig);

        const ssmPrefix = `/${id}`
        const vpc = new ec2.Vpc(this, id, {
            vpcName: id,
            // no nats gateway or instance
            natGateways: 0,
            enableDnsHostnames: true,
            enableDnsSupport: true,
            maxAzs: vpcConfig.maxAZs,
            ipAddresses: ec2.IpAddresses.cidr(vpcConfig.cidr? vpcConfig.cidr : '10.0.0.0/16'),
            subnetConfiguration: [
                {
                    name: 'GS-Routable',
                    subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
                    cidrMask: vpcConfig.privateSubnetCidrMask,
                },
                {
                    name: 'Cloud-Routable',
                    subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
                    cidrMask: vpcConfig.privateSubnetCidrMask,
                },
            ],

        })
        cdk.Tags.of(vpc).add('Name', id);

        const isolatedSubnets = vpc.selectSubnets({
            subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        });

        isolatedSubnets.subnets.forEach((subnet,index) => {
            cdk.Tags.of(subnet).add('Name', `private-subnet-${subnet.availabilityZone}`);

        })
    
        new ssm.StringParameter(this, 'ssmVpcId', {
            parameterName: `${ssmPrefix}/vpc/vpc-id`,
            stringValue: vpc.vpcId,
          });
      
        // Security group to govern who can access the endpoints
        const endpointSecurityGroup = new ec2.SecurityGroup(this, "EndpointSecurityGroup", {vpc: vpc})
        endpointSecurityGroup.addIngressRule(ec2.Peer.ipv4(vpc.vpcCidrBlock), ec2.Port.tcp(443))

         // vpc endpoints to connect to aws services
    vpc.addGatewayEndpoint('s3-endpoint', {
        service: ec2.GatewayVpcEndpointAwsService.S3
      });
  
      vpc.addInterfaceEndpoint("ECRAPIEndpoint", {
        service: ec2.InterfaceVpcEndpointAwsService.ECR,
        privateDnsEnabled: true,
        securityGroups: [endpointSecurityGroup],
        subnets: isolatedSubnets,
      })
  
      vpc.addInterfaceEndpoint("ECRDockerEndpoint", {
        service: ec2.InterfaceVpcEndpointAwsService.ECR_DOCKER,
        privateDnsEnabled: true,
        securityGroups: [endpointSecurityGroup],
        subnets: isolatedSubnets,
      })
      
      vpc.addInterfaceEndpoint("CWLogsEndpoint", {
        service: new ec2.InterfaceVpcEndpointService(`com.amazonaws.${vpcConfig.env?.region}.logs`),
        privateDnsEnabled: true,
        securityGroups: [endpointSecurityGroup],
        subnets: isolatedSubnets,
      })
  
      vpc.addInterfaceEndpoint("STSEndpoint", {
        service: ec2.InterfaceVpcEndpointAwsService.STS,
        privateDnsEnabled: true,
        securityGroups: [endpointSecurityGroup],
        subnets: isolatedSubnets
      })
  
      const ec2Endpoint = vpc.addInterfaceEndpoint("EC2Endpoint", {
        service: ec2.InterfaceVpcEndpointAwsService.EC2,
        privateDnsEnabled: true,
        securityGroups: [endpointSecurityGroup],
        subnets: isolatedSubnets
      })
  
      const controlPlaneSg = new ec2.SecurityGroup(this, "ControlPlaneSecurityGroup", {
        vpc: vpc,
      })

      // Generating outputs
    new cdk.CfnOutput(this, 'ControlPlaneSecurityGroups', {
        description: 'Security group for the cluster control plane communication with worker nodes',
        exportName: `controlPlaneSecurityGroup`,
        value: controlPlaneSg.securityGroupId,
    });
  
      
    }
}