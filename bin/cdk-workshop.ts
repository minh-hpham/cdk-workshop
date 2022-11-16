#!/usr/bin/env node
import * as cdk from '@aws-cdk/core';
import * as eks from '@aws-cdk/aws-eks';
import * as ec2 from '@aws-cdk/aws-ec2';
import { EKSCluster } from '../lib/eks-stack';
import { EKSBastion } from '../lib/bastion-stack';

const app = new cdk.App();

const env = {
    region: process.env.CDK_DEFAULT_REGION,
    account: process.env.CDK_DEFAULT_ACCOUNT,
};

const cluster1002 = new EKSCluster(app, "eks-cluster-1002", {
    clusterName: "1002",
    version: eks.KubernetesVersion.V1_21,
    env: env
});

const bastion1002 = new EKSBastion(app, "eks-bastion-1002", {
    name: "eks-bastion-1002",
    vpc: cluster1002.vpc,
    securityGroup: cluster1002.bastionSecurityGroup,
    env: env
});