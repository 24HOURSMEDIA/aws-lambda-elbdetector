var merge = require('merge');
var fs = require('fs');
var AWS = require('aws-sdk');

var awsConfig = merge(
    JSON.parse(fs.readFileSync('./../etc/aws.json.dist', 'utf8')),
    JSON.parse(fs.readFileSync('./../etc/aws.json', 'utf8'))
);


AWS.config.update({
    accessKeyId: awsConfig.aws_access_key,
    secretAccessKey: awsConfig.aws_secret_access_key,
    region: awsConfig.aws_region
});


var finder = require('../lib/aws-ec2instancefinder')(new AWS.EC2());

finder.findByRunningAndHavingTags([
    {key: 'stack', value: 'vertigo-api2'}
], function (err, instances) {
    console.log('found %s instances', instances.length);

});







