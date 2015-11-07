var fs = require('fs');
var async = require('async');
var merge = require('merge');


var elbFactory = require('./lib/dto/elbfactory');
var messageFactory = require('./lib/dto/messagefactory');

exports.handler = function (event, context) {

    // configurable options through event
    var awsConfig = merge(
        JSON.parse(fs.readFileSync('./etc/aws.json.dist', 'utf8')),
        JSON.parse(fs.readFileSync('./etc/aws.json', 'utf8'))
    );
    var AWS = require('aws-sdk');
    AWS.config.update({
        accessKeyId: awsConfig.aws_access_key,
        secretAccessKey: awsConfig.aws_secret_access_key,
        region: awsConfig.aws_region
    });

    var configKey = 'sendec2sqsmessage';
    var defaultsConfigFile = './etc/' + configKey + '.json.dist';
    var envConfigFile = './etc/' + configKey + '.json';
    if (process.env.hasOwnProperty('lambdafunc_configfile')) {
        envConfigFile = process.env['lambdafunc_configfile'];
    }
    console.log('config file %s', envConfigFile);
    var config = merge(
        JSON.parse(fs.readFileSync(defaultsConfigFile, 'utf8')),
        JSON.parse(fs.readFileSync(envConfigFile, 'utf8')),
        event.hasOwnProperty('config_override') ? event.config_override : {}
    );

    var main = require('./lib/main')(AWS);


    var finder = require('./lib/my_modules/aws-ec2instancefinder')(new AWS.EC2());

    console.log('loaded config');
    var locals = {
        s3events: event,
        changed_elbs: [],
        instances: []
    };

    var S3 = new AWS.S3();

    async.waterfall([
            function (next) {
                // create parameter sets from the s3 events
                var s3ParamSets = [];
                locals.s3events.Records.forEach(function (s3event) {
                    s3ParamSets.push({Bucket: s3event.s3.bucket.name, Key: s3event.s3.object.key});
                });
                // get elb status definitions for only the changed
                // elbs
                main.getElbsThatHaveChangedFromS3(s3ParamSets, function (err, data) {
                    console.log('changed elbs', data.map(function (v) {
                        return v.name
                    }));
                    locals.changed_elbs = data;
                    next(err);
                });
            },
            function (next) {
                console.log('find ec2 instance ids for the retrieved elbs');
                async.forEach(locals.changed_elbs, function (elb, next) {
                    console.log('checking elb', elb.name);
                    if (config.elbs[elb.name] && config.elbs[elb.name].instance_tags && config.elbs[elb.name].instance_tags.length) {
                        main.findRunningEc2InstanceIdsByTags(
                            config.elbs[elb.name].instance_tags,
                            function (err, result) {
                                if (err) {
                                    next(err);
                                    return;
                                }
                                result.forEach(function (instance) {
                                    instance.elb = elb;
                                    locals.instances.push(instance);
                                });
                                next();
                            }
                        );
                    }
                }, function (err) {
                    next(err);
                });
            },
            // final action, create messages for each found entry to put in the sqs queue.
            function (next) {
                console.log('create sqs messages for %s instances', locals.instances.length);
                // create sqs messages
                var SQS = new AWS.SQS();
                async.each(locals.instances, function (instance, next) {
                        var messageData = messageFactory.createEventMessage();
                        messageData.event_id = "elb.ipchanged";
                        messageData.target_instance_id = instance.instance_id;
                        messageData.event_data = {
                            "elb": instance.elb
                        };
                        // send to sqs queue
                        var params = {
                            MessageBody: 'Event that notifies instance ' + instance.instance_id + ' that ELB ' + instance.elb.name + " has changed ips: " + instance.elb.describeChanges(),
                            MessageAttributes: {
                                type: {
                                    DataType: 'String',
                                    StringValue: "ec2agent-notification"
                                }
                                ,
                                message: {
                                    DataType: 'String',
                                    StringValue: JSON.stringify(messageData)
                                }
                            }
                            ,
                            QueueUrl: config.sqs_queue_url
                        };
                        if (!config.test) {
                            SQS.sendMessage(params, function (err) {
                                if (!err) {
                                    console.log('message sent');
                                }
                                next(err);
                            });
                        } else {
                            console.log('message sending suspended');
                            next();
                        }
                    }, function (err, data) {
                        if (err) {
                            console.log(err);
                        }
                        next(err);
                    }
                );

            }
        ],
        function (err) {
            if (err) {
                console.log(err);
                context.done(err, 'something went wrong');
            } else {
                console.log('finished');
                context.done(null, 'done');
            }
        }
    )


}