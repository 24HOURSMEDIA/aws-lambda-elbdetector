# aws-lambda-elbdetector
Lambda functions for handling changes in ELBs


npm install node-lambda -g

    lambda-local -l detectandwriteelbips.js -h handler -e test/detectandwriteelbips.event.json -t 12


zip lambda-deploymentpackage/aws-lambda-elbdetector.zip detectandwriteelbips.js node_modules lib etc -r


