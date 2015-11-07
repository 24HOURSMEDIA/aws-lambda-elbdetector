# aws-lambda-elbdetector
Lambda functions for handling changes in ELBs


## Testing/sample invocations

you should have node-lambda installed locally

    npm install node-lambda -g

detect elb ip changes and write them to S3

    node-lambda run -h detectandwriteelbips.handler -j sample-eventfiles/empty-event.json


    node-lambda run -h sendec2sqsmessage.handler -j sample-eventfiles/s3-elb-change.json


create deployment package manually

    zip lambda-deploymentpackage/aws-lambda-elbdetector.zip detectandwriteelbips.js node_modules lib etc -r


    sh deploy/staging/deploy_sendec2sqsmessage.sh