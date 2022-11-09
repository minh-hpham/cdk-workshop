#!/usr/bin/env node
import * as cdk from '@aws-cdk/core';
import { EKSCluster } from '../lib/eks-stack';

const app = new cdk.App();

const cluster = new EKSCluster(app, "eks-cluster-1002", {
    clusterName: "1002",
    version: "v1_21",
    env: {
        region: process.env.CDK_DEFAULT_REGION,
        account: process.env.CDK_DEFAULT_ACCOUNT,
    }
})