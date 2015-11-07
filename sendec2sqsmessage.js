console.log('starting');

var fs = require('fs');
var async = require('async');
var merge = require('merge');

var elbFactory = require('./lib/dto/elbfactory');
var messageFactory = require('./lib/dto/messagefactory');

exports.handler = function (event, context) {

    /*
    if (fs.existsSync('~/test')) {
        console.log('exists');
    }
    fs.writeFileSync('~/test', 'hello');
    console.log('written');
    if (fs.existsSync('~/test')) {
        console.log('exists');
    }
*/
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
    var envConfigFile ='./etc/' + configKey + '.json';
    if (process.env.hasOwnProperty('lambdafunc_configfile')) {
        envConfigFile = process.env['lambdafunc_configfile'];
    }
    console.log('config file %s',envConfigFile);
    var config = merge(
        JSON.parse( fs.readFileSync(defaultsConfigFile, 'utf8')),
        JSON.parse(fs.readFileSync(envConfigFile, 'utf8')),
        event.hasOwnProperty('config_override') ? event.config_override : {}
    );

    var finder = require('./lib/my_modules/aws-ec2instancefinder')(new AWS.EC2());

    console.log('loaded config');
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
                        console.log('processing s3 event record');
                        var params = {Bucket: s3event.s3.bucket.name, Key: s3event.s3.object.key};
                        S3.getObject(params, function (err, data) {
                            if (err) {
                                console.log(err);
                                next(err);
                            } else {
                                console.log('elb data retrieved');
                                var elbData = elbFactory.create();

                                elbData.deserialize(data.Body);
                                console.log('checking elb');
                                if (elbData.ipsHaveChanged()) {
                                    console.log('ips have changed for elb %s', elbData.name);
                                    // find instances that are dependent upon elbs
                                    if (config.elbs[elbData.name]) {
                                        console.log('elb..');
                                        finder.findByRunningAndHavingTags(config.elbs[elbData.name].instance_tags, function (err, instances) {
                                            if (err) {
                                                console.log('error');
                                            } else
                                            {
                                                console.log('found instances');
                                                instances.forEach(function (i) {
                                                    locals.instances.push({
                                                        instance_id: i.InstanceId,
                                                        elb: elbData
                                                    });
                                                });
                                            }
                                            next(err);
                                        });
                                    } else {
                                        next(err);
                                    }
                                } else {
                                    next(err);
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
                console.log('create sqs messages for %s instances', locals.instances.length);
                // create sqs messages
                var SQS = new AWS.SQS();
                async.each(locals.instances, function (instance, next) {

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

                        if (!config.test) {

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


               // next();
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
