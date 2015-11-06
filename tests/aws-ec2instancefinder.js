var merge = require('merge');
var fs = require('fs');
var AWS = require('aws-sdk');

require('../lib/aws-ec2instancefinder');


var awsConfig = merge(
    JSON.parse(fs.readFileSync('./../etc/aws.json.dist', 'utf8')),
    JSON.parse(fs.readFileSync('./../etc/aws.json', 'utf8'))
);


AWS.config.update({
    accessKeyId: awsConfig.aws_access_key,
    secretAccessKey: awsConfig.aws_secret_access_key,
    region: awsConfig.aws_region
});

finder = new EC2InstanceFinder(new AWS.EC2());
console.log(finder);


finder.findByRunningAndHavingTags([
    {key: 'stack', value: 'vertigo-api2'}
], function (err, instances) {
    console.log('found %s instances', instances.length);
   // console.log(instances);
});






