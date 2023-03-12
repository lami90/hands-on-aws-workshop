import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { CfnParameter } from 'aws-cdk-lib';
import * as assets from 'aws-cdk-lib/aws-ecr-assets';
import {InstanceClass, InstanceSize, IVpc} from 'aws-cdk-lib/aws-ec2';
import { Effect } from 'aws-cdk-lib/aws-iam';

export class FargateStack extends cdk.Stack {

    constructor(mskVpc: IVpc, fargateSecurityGroup: ec2.SecurityGroup, scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        const consumerGroupId = new CfnParameter(this, "consumerGroupId", {
            type: "String",
            description: "Kafka consumer group",
        });

        const bootstrapAddress = new CfnParameter(this, "bootstrapAddress", {
            type: "String",
            description: "Bootstrap address for Kafka broker. Corresponds to bootstrap.servers Kafka consumer configuration"
        });

        let topicName = new CfnParameter(this, "topicName", {
            type: "String",
            description: "Kafka topic name"
        });

        const image = new assets.DockerImageAsset(this, "ConsumerImage", {
            directory: './consumer/docker'
        });

        const fargateTaskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDef', {
            memoryLimitMiB: 4096,
            cpu: 512
        });

        const cluster = new ecs.Cluster(this, 'Cluster', {
            vpc: mskVpc,
        });

        cluster.addCapacity('DefaultAutoScalingGroupCapacity', {
            instanceType: ec2.InstanceType.of(InstanceClass.T3, InstanceSize.SMALL),
            desiredCapacity: 1,
        });

        fargateTaskDefinition.addContainer("KafkaConsumer", {
            image: ecs.ContainerImage.fromDockerImageAsset(image),
            logging: ecs.LogDrivers.awsLogs({streamPrefix: 'KafkaConsumer'}),
            environment: {
                'GROUP_ID': consumerGroupId.valueAsString,
                'BOOTSTRAP_ADDRESS': bootstrapAddress.valueAsString,
                'REGION': this.region,
                'TOPIC_NAME': topicName.valueAsString
            }
        });

        //TODO: harden security
        fargateTaskDefinition.addToTaskRolePolicy(new iam.PolicyStatement({
                effect: Effect.ALLOW,
                actions: ["kafka:*"],
                resources: ["*"]
            }
        ));

        const service = new ecs.FargateService(this, 'Service', {
            cluster: cluster,
            securityGroups: [fargateSecurityGroup],
            taskDefinition: fargateTaskDefinition,
            desiredCount: 1,
            assignPublicIp: true
        });
    }
}
