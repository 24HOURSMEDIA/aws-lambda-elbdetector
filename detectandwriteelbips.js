console.log('Loading function');


var DNS = require('dns');
var merge = require('merge');
var async = require('async');

exports.handler = function(event, context) {
    // configurable options through event
    var config = {
        aws_access_key: "",
        aws_secret_access_key: "",
        aws_region: "",
        elb_names: ["vertigo-cf-lb","verobackend-ix-private-lb"],
        s3_bucket: "",
        s3_dir: "elb",
        test: true
    }
    config = merge(config, event);

    console.log("STARTING IN %s MODE", config.test ? "TEST" : "PROD");

    var AWS = require('aws-sdk');
    AWS.config.update({
        accessKeyId: config.aws_access_key,
        secretAccessKey: config.aws_secret_access_key,
        region: config.aws_region
    });

    var locals = {
        elbs: []
    };

    // ELB data transfer object to store on S3
    var Elb = function() {
        this.type = 'elb';
        this.name = '';
        this.dns = '';
        this.ipv4 = [];
        this.prev_ipv4 = [];
        this.ipv6 = [];
        this.prev_ipv6 = [];
        this.changed = null;
    }

    async.series([
            function(callback) {
                // get the elb descriptions from AWS
                // and create an Elb in locals.elbs
                console.log('Retrieving ELB data');
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
                console.log('Looking up IPV4 and IPV6 for ELBs');
                // locals.elbs now contains array of loadbalancer objects
                // foreach local.elbs, append ipv4 and ipv6 adresses
                async.forEach(locals.elbs, function(elb, callback) {
                    // lookup ipv4 and ipv6 adresses
                    async.parallel([
                        function(callback) {
                            DNS.resolve4(elb.dns, function(err,data) {
                                if (!err) {
                                    elb.ipv4 = data.sort();
                                } else {
                                    if (err.code == 'ENODATA') {
                                        err =  null;
                                    }
                                }
                                callback(err);
                            });
                        },
                        function(callback) {
                            DNS.resolve6(elb.dns, function(err,data) {
                                if (!err) {
                                    elb.ipv6 = data.sort();;
                                } else {
                                    if (err.code == 'ENODATA') {
                                        err =  null;
                                    }
                                }
                                callback(err);
                            });
                        }
                    ], function(err) {
                        callback(err);
                    });
                }, function(err) {
                    callback(err);
                });
            },
            function(callback) {
                // loading previous data
                console.log('Loading previous data from S3');
                var S3 = new AWS.S3({});
                async.forEach(locals.elbs, function(elb, callback) {
                    var key = config.s3_dir + "/" + elb.name;
                    var params = {Bucket: config.s3_bucket, Key: key};
                    S3.getObject(params, function(err,data) {
                        if (!err) {
                            var oldElb = JSON.parse(data.Body);
                            elb.prev_ipv4 = oldElb.ipv4;
                            elb.prev_ipv6 = oldElb.ipv6;
                        } else if (err.code == 'NoSuchKey') {
                            // first instantiation
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
                console.log('Writing changed ELB datas to S3');
                var S3 = new AWS.S3({});
                async.forEach(locals.elbs, function(elb, callback) {
                        if (elb.ipv4.toString() != elb.prev_ipv4.toString() || elb.ipv6.toString() != elb.prev_ipv6.toString()) {
                            console.log('elb %s ips changed!', elb.name);
                            elb.changed = new Date();
                            if (config.test) {
                                console.log("running in test mode, skipped storing on s3");
                                callback();
                            } else {
                                var key = config.s3_dir + "/" + elb.name;
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