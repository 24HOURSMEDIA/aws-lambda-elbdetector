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


    var config = merge(
        JSON.parse(fs.readFileSync('./etc/sendec2sqsmessage.json.dist', 'utf8'), fs.readFileSync('./etc/sendec2sqsmessage.json', 'utf8'))
    );
    var finder = require('./lib/my_modules/aws-ec2instancefinder')(new AWS.EC2());

    var locals = {
        s3events: event,
        instances: []
    };

    var S3 = new AWS.S3();

    async.waterfall([
            function (next) {
                async.forEach(
                    locals.s3events.Records,
                    function (s3event, next) {

                        var params = {Bucket: s3event.s3.bucket.name, Key: s3event.s3.object.key};
                        S3.getObject(params, function (err, data) {
                            if (err) {
                                console.log(err);
                                next(err);
                            } else {
                                var elbData = elbFactory.create();

                                elbData.deserialize(data.Body);

                                if (elbData.ipsHaveChanged()) {

                                    // find instances that are dependent upon elbs
                                    if (config.elbs[elbData.name]) {
                                        // console.log(elbData);
                                        finder.findByRunningAndHavingTags(config.elbs[elbData.name].instance_tags, function (err, instances) {
                                            //console.log(instances);
                                            instances.forEach(function (i) {
                                                locals.instances.push({
                                                    instance_id: i.InstanceId,
                                                    elb: elbData
                                                });
                                            });
                                            next();
                                        });
                                    }
                                } else {
                                    next();
                                }

                            }
                        });
                    },
                    function (err) {
                        next(err);
                    }
                );
            },
            function (next) {
                // create sqs messages
                var SQS = new AWS.SQS();
                async.forEach(locals.instances, function (instance, next) {

                        var messageData = messageFactory.createEventMessage();
                        messageData.event_id = "elb.ipchanged";
                        messageData.target_instance_id = instance.instance_id;
                        messageData.event_data = {
                            "elb_state": instance.elb
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

                        if (false) {

                            SQS.sendMessage(params, function (err, data) {
                                if (!err) {
                                    console.log('message sent');
                                }
                                next(err);
                            });
                        } else {
                            console.log('message sending suspended');
                            //console.log(params);
                            next();
                        }

                    }, function (err, data) {
                        if (err) {
                            console.log(err);
                        }
                        next(err);
                    }
                );


                next();
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
    ;


}
