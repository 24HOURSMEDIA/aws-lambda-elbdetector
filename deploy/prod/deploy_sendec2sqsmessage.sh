#!/bin/sh


// pre deploy
mv node_modules/aws-sdk $TMPDIR/.aws-sdk
node-lambda deploy  -n sendec2sqsmessage -h sendec2sqsmessage.handler -e prod -f deploy/prod/sendec2sqsmessage.env
mv $TMPDIR/.aws-sdk node_modules/aws-sdk