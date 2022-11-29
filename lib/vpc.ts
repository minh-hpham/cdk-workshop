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
    availabilityZones: string[];
}

export class VPCStack extends cdk.Stack {
    public vpc: ec2.IVpc;
    public eniSecurityGroup: ec2.ISecurityGroup;

    constructor(scope: Construct, id: string, vpcConfig: VpcConfigProps) {
        super(scope, id, vpcConfig);

        const ssmPrefix = `/${id}`
        const vpc = new ec2.Vpc(this, id, {
            // eks requires at least 2 AZs
            availabilityZones: vpcConfig.availabilityZones,
            vpcName: id,
            // enabled to use vpc endpoint, https://docs.aws.amazon.com/vpc/latest/privatelink/create-interface-endpoint.html#prerequisites-interface-endpoints
            enableDnsHostnames: true,
            enableDnsSupport: true,
            ipAddresses: ec2.IpAddresses.cidr(vpcConfig.cidr? vpcConfig.cidr : '10.0.0.0/16'),
            subnetConfiguration: [
              {
                name: 'GS-Routable',
                subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
              },
              {
                name: 'Cloud-Routable',
                subnetType: ec2.SubnetType.PUBLIC,
              },
            ],
            // can't reference nat gw from vpc so we'll create our own below
            natGateways: 0,
        })

        cdk.Tags.of(vpc).add('Name', id);
        
        // create custom route tables
        const publicSubnetRouteTable = new ec2.CfnRouteTable(this, 'publicCustomRoutetable', {
          vpcId: vpc.vpcId,
          
          // the properties below are optional
          tags: [{
            key: 'name',
            value: 'PublicSubnetRouteTable'
          }],
        });

        const internetGatewayRoute = new ec2.CfnRoute(this, 'internetGWRoute', {
          routeTableId: publicSubnetRouteTable.attrRouteTableId,
          destinationCidrBlock: "0.0.0.0/0",
          gatewayId: vpc.internetGatewayId!,
        })

        const publicSubnets = vpc.selectSubnets({
          subnetType: ec2.SubnetType.PUBLIC
        })

        publicSubnets.subnets.forEach((subnet,index) => {
          cdk.Tags.of(subnet).add('Name', `public-subnet-${subnet.availabilityZone}-${index}`);

          const cfnSubnetRouteTableAssociation = new ec2.CfnSubnetRouteTableAssociation(this, `public-subnet-${subnet.availabilityZone}-${index}`, {
            routeTableId: publicSubnetRouteTable.attrRouteTableId,
            subnetId: subnet.subnetId,
          });
        })

        // create Elastic IP for NAT gateway
        const elasticIP = new ec2.CfnEIP(this, "natGatewayEIP", {
          domain: "vpc",
          tags: [{key: 'Name', value: "natGatewayEIP"}],
        })
        // create NAT gateway here instead of using VPC construct props
        // so we can get the NAT gateway ID and attach it to the custom route table
        const natGateway = new ec2.CfnNatGateway(this, "natGateway", {
          subnetId: publicSubnets.subnets[0].subnetId,
          allocationId: elasticIP.attrAllocationId,
          connectivityType: "public",
          tags: [{key: 'Name', value: publicSubnets.subnets[0].stack.stackName}]
        })

        const isolatedSubnets = vpc.selectSubnets({
            subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        });

        isolatedSubnets.subnets.forEach((subnet,index) => {
            cdk.Tags.of(subnet).add('Name', `isolatedSubnet${subnet.availabilityZone}-${index}`);

            new ec2.CfnRoute(this, `natgwIsolatedSubnet${subnet.availabilityZone}-${index}`, {
              routeTableId: subnet.routeTable.routeTableId,
              destinationCidrBlock: "0.0.0.0/0",
              natGatewayId: natGateway.attrNatGatewayId,
            })
        })
          
        new ssm.StringParameter(this, 'ssmVpcId', {
            parameterName: `${ssmPrefix}/vpc/vpc-id`,
            stringValue: vpc.vpcId,
          });
      
        // Security group to govern who can access the endpoints
        const endpointSecurityGroup = new ec2.SecurityGroup(this, "endpointSecurityGroup", {vpc: vpc})
        endpointSecurityGroup.addIngressRule(ec2.Peer.ipv4(vpc.vpcCidrBlock), ec2.Port.tcp(443))

      // vpc endpoints to connect to aws services
      const s3Endpoint = vpc.addGatewayEndpoint('s3Endpoint', {
        service: ec2.GatewayVpcEndpointAwsService.S3,
        subnets: [{availabilityZones: vpc.availabilityZones}],
      });
  
      vpc.addInterfaceEndpoint("ecrAPIEndpoint", {
        service: ec2.InterfaceVpcEndpointAwsService.ECR,
        privateDnsEnabled: true,
        securityGroups: [endpointSecurityGroup],
        subnets: {availabilityZones: vpc.availabilityZones},
      })
  
      vpc.addInterfaceEndpoint("ecrDockerEndpoint", {
        service: ec2.InterfaceVpcEndpointAwsService.ECR_DOCKER,
        privateDnsEnabled: true,
        securityGroups: [endpointSecurityGroup],
        subnets: {availabilityZones: vpc.availabilityZones},
      })
      
      vpc.addInterfaceEndpoint("cloudWatchLogsEndpoint", {
        service: ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
        privateDnsEnabled: true,
        securityGroups: [endpointSecurityGroup],
        subnets: {availabilityZones: vpc.availabilityZones},
      })
  
      vpc.addInterfaceEndpoint("stsEndpoint", {
        service: ec2.InterfaceVpcEndpointAwsService.STS,
        privateDnsEnabled: true,
        securityGroups: [endpointSecurityGroup],
        subnets: {availabilityZones: vpc.availabilityZones},
      })
  
      vpc.addInterfaceEndpoint("ec2Endpoint", {
        service: ec2.InterfaceVpcEndpointAwsService.EC2,
        privateDnsEnabled: true,
        securityGroups: [endpointSecurityGroup],
        subnets: {availabilityZones: vpc.availabilityZones},
      })

      vpc.addInterfaceEndpoint("lambdaEndpoint", {
        service: ec2.InterfaceVpcEndpointAwsService.LAMBDA,
        privateDnsEnabled: true,
        securityGroups: [endpointSecurityGroup],
        subnets: {availabilityZones: vpc.availabilityZones},
      })

      vpc.addInterfaceEndpoint("cloudFormationEndpoint", {
        service: ec2.InterfaceVpcEndpointAwsService.CLOUDFORMATION,
        privateDnsEnabled: true,
        securityGroups: [endpointSecurityGroup],
        subnets: {availabilityZones: vpc.availabilityZones},
      })

      vpc.addInterfaceEndpoint("kmsEndpoint", {
        service: ec2.InterfaceVpcEndpointAwsService.KMS,
        privateDnsEnabled: true,
        securityGroups: [endpointSecurityGroup],
        subnets: {availabilityZones: vpc.availabilityZones},
      })
      ec2.InterfaceVpcEndpointAwsService.EMR_EKS
  
      const controlPlaneSg = new ec2.SecurityGroup(this, "controlPlaneEniSG", {
        vpc: vpc,
        allowAllOutbound: true,
      })
      controlPlaneSg.addIngressRule(ec2.Peer.ipv4(vpc.vpcCidrBlock), ec2.Port.tcp(443), "connectivity from other things running in the cluster")

      // Generating outputs
      new cdk.CfnOutput(this, 'controlPlaneENISecurityGroup', {
          description: 'Security group for the cluster control plane communication with worker nodes',
          exportName: `controlPlaneSecurityGroup`,
          value: controlPlaneSg.securityGroupId,
      });

      this.vpc = vpc;
      this.eniSecurityGroup = controlPlaneSg;
    }
}