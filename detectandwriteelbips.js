var DNS = require('dns');
var merge = require('merge');
var async = require('async');
var fs = require('fs');

require('./lib/elb');

exports.handler = function(event, context) {
    // configurable options through event
    var awsConfig = merge(
        JSON.parse(fs.readFileSync('./etc/aws.json.dist', 'utf8')),
        JSON.parse(fs.readFileSync('./etc/aws.json', 'utf8'))
    );
    var config = merge(
        JSON.parse(fs.readFileSync('./etc/detectandwriteelbips.json.dist', 'utf8')),
        JSON.parse(fs.readFileSync('./etc/detectandwriteelbips.json', 'utf8'))
    );
    console.log("STARTING IN %s MODE", config.test ? "TEST" : "PROD");
    var AWS = require('aws-sdk');
    AWS.config.update({
        accessKeyId: awsConfig.aws_access_key,
        secretAccessKey: awsConfig.aws_secret_access_key,
        region: awsConfig.aws_region
    });

    var locals = {
        elbs: []
    };

    async.series([
            function(callback) {
                // get the elb descriptions from AWS
                // and create an Elb in locals.elbs
                console.log('retrieving ELB data for ELBs %s', config.elb_names.length > 0 ? config.elb_names.join(', ') : 'all ELBS');
                var awsElb = new AWS.ELB({
                    apiVersion: '2012-06-01'
                });
                awsElb.describeLoadBalancers({
                        LoadBalancerNames: config.elb_names
                    }, function(err, data) {
                        if (!err) {
                            // store elb dns names in locals
                            for (var elbIndex = 0; elbIndex < data.LoadBalancerDescriptions.length; elbIndex++) {
                                var elb = new Elb();
                                elb.name = data.LoadBalancerDescriptions[elbIndex].LoadBalancerName;
                                elb.dns = data.LoadBalancerDescriptions[elbIndex].DNSName;
                                locals.elbs.push(elb);
                            }
                        }
                        callback(err);
                });

            },
            function(callback) {
                if (locals.elbs.length == 0) {
                    console.log('no ELBS found.');
                    callback();
                } else {
                    console.log('found elbs %s', locals.elbs.map(function (elb) {
                        return elb.name;
                    }).join(', '), 'looking up ipv4 and ipv6 for elbs');

                    console.log('looking up IPV4 and IPV6 for ELBs');
                    // locals.elbs now contains array of loadbalancer objects
                    // foreach local.elbs, append ipv4 and ipv6 adresses
                    async.forEach(locals.elbs, function (elb, callback) {
                        // lookup ipv4 and ipv6 adresses
                        async.parallel([
                            function (callback) {
                                DNS.resolve4(elb.dns, function (err, data) {
                                    if (!err) {
                                        elb.ipv4 = data.sort();
                                    } else {
                                        if (err.code == 'ENODATA') {
                                            err = null;
                                        }
                                    }
                                    callback(err);
                                });
                            },
                            function (callback) {
                                DNS.resolve6(elb.dns, function (err, data) {
                                    if (!err) {
                                        elb.ipv6 = data.sort();
                                    } else {
                                        if (err.code == 'ENODATA') {
                                            err = null;
                                        }
                                    }
                                    callback(err);
                                });
                            }
                        ], function (err) {
                            callback(err);
                        });
                    }, function (err) {
                        callback(err);
                    });
                }
            },
            function(callback) {
                // loading previous data
                console.log('loading previous data from S3');
                var S3 = new AWS.S3({});
                async.forEach(locals.elbs, function(elb, callback) {
                    var key = config.s3_dir + "/" + elb.name + ".json";
                    var params = {Bucket: config.s3_bucket, Key: key};
                    S3.getObject(params, function(err,data) {
                        if (!err) {
                            var oldElb = JSON.parse(data.Body);
                            elb.prev_ipv4 = oldElb.ipv4;
                            elb.prev_ipv6 = oldElb.ipv6;
                        } else if (err.code == 'NoSuchKey') {
                            // first instantiation
                            console.log('first storage of elb description for %s', elb.name);
                            err = null;
                        }
                        callback(err);
                    });
                }, function(err) {
                    callback(err);
                });
            },
            function(callback) {
                // get the existing description and verify if ipv4 or ipv6 is changed.
                // if changed, write data to S3
                console.log('detecting changed ips for elbs and if changed write to to S3');
                var S3 = new AWS.S3({});
                async.forEach(locals.elbs, function(elb, callback) {
                        console.log(elb.describeChanges());
                        if (elb.hasChanged()) {
                            elb.changed = new Date();
                            if (config.test) {
                                console.log("running in test mode, skipped storing on s3");
                                callback();
                            } else {
                                var key = config.s3_dir + "/" + elb.name + ".json";
                                console.log("writing data to %s %s", config.s3_bucket, key);
                                var params = {Bucket: config.s3_bucket, Key: key, Body: JSON.stringify(elb)};
                                S3.putObject(params, function(err, data) {
                                    callback(err);
                                });
                            }
                        } else {
                            console.log('no change for elb ' + elb.name);
                            callback();
                        }
                    }, function(err) {
                        callback(err);
                });

            },
            function(callback) {
                console.log('all done');
                callback();
            }
        ],
        function(err) {
            if (err) {
                console.log(err);
                context.done(err,'something went wrong');
            } else {
                context.done(null, 'done');
            }
        }
    );

};