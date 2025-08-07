# MeteorS3 development app

This app is just used for developing and testing the MeteorS3 package. For details on the packages cf. [the package README.md](packages/meteor-s3/README.md)

## Run this app

To run this, do the following:

- `meteor npm install`
- copy `settings.json.example` to `settings.json``
- create an IAM user on aws with the proper policy; cf. the [the package README.md](packages/meteor-s3/README.md#required-policy) for further details.

## Run tests

The tests require [LocalStack](https://github.com/localstack/localstack) to be running on your machine.