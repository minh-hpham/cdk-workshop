#!/usr/bin/env node

import * as cdk from 'aws-cdk-lib';
import {VPCStack} from '../lib/vpc'

const app = new cdk.App();

const env = {
    region: process.env.CDK_DEFAULT_REGION,
    account: process.env.CDK_DEFAULT_ACCOUNT,
};

const cluster = "cluster-1002"

const clusteVPC = new VPCStack(app, `vpc-${cluster}`, {
    env: env,
    cidr: "192.168.0.0/16",
    description: "vpc for cluster 1002",
    isolatedSubnetCidrMask: 18,
    privateSubnetCidrMask: 18,
    publicSubnetCidrMask: 18,
    maxAZs: 1,
})
