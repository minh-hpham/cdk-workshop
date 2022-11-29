#!/usr/bin/env node

import * as cdk from 'aws-cdk-lib';
import * as eks from 'aws-cdk-lib/aws-eks';
import { BastionStack } from '../lib/bastion-stack';
import { EKSCluster } from '../lib/eks-stack';
import {VPCStack} from '../lib/vpc'

const app = new cdk.App();

const env = {
    region: process.env.CDK_DEFAULT_REGION,
    account: process.env.CDK_DEFAULT_ACCOUNT,
};

const clusterName = "cluster-1002"

const clusterVPC = new VPCStack(app, `vpc-${clusterName}`, {
    env: env,
    cidr: "10.0.0.0/16",
    description: "vpc for cluster 1002",
    isolatedSubnetCidrMask: 18,
    privateSubnetCidrMask: 18,
    publicSubnetCidrMask: 18,
    availabilityZones: ["us-east-1a", "us-east-1b"]
})

const eksCluster = new EKSCluster(app, `eks-${clusterName}`, {
    env: env,
    clusterName: clusterName,
    version: eks.KubernetesVersion.V1_21,
    controlPlaneENISg: clusterVPC.eniSecurityGroup,
    vpc: clusterVPC.vpc,
})

const clusterBastion = new BastionStack(app, `bastion-${clusterName}`, {
    env: env,
    vpc: clusterVPC.vpc,
})
