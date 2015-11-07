;(function (isNode) {

    var async = require('async');

    var Main = function(AWS) {
        var AWS = AWS;
        var self = this;
        this.public = {
            /**
             *
             * @param tagFilters
             */
            findRunningEc2InstanceIdsByTags: function(tagFilters, next) {
                var finder = require('./my_modules/aws-ec2instancefinder')(new AWS.EC2());
                finder.findByRunningAndHavingTags(tagFilters, function (err, instances) {
                    var instances2 = [];
                    instances.forEach(function (i) {
                        instances2.push({
                            instance_id: i.InstanceId
                        });
                    });
                    return next(err, instances2);
                });
            },
            getElbsThatHaveChangedFromS3: function(s3ParamSets, next) {
                var elbs = [];
                var S3 = new AWS.S3();
                var elbFactory = require('./dto/elbfactory');
                async.forEach(s3ParamSets, function(params, next) {
                    S3.getObject(params, function (err, data) {
                        if (err) {
                            next(err);
                            return;
                        }
                        var elbData = elbFactory.create();
                        elbData.deserialize(data.Body);
                        if (elbData.ipsHaveChanged()) {
                            elbs.push(elbData);
                        };
                        next();
                    });
                }, function(err) {
                    next(err,elbs);
                });
            }
        } /* public */
    };

    if (isNode) {
        module.exports = function (AWS) {
            var main = new Main(AWS);
            return main.public;
        }

    }



})
(typeof module === 'object' && module && typeof module.exports === 'object' && module.exports);