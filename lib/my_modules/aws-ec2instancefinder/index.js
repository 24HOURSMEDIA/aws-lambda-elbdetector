var async = require('async');

;(function (isNode) {
    var EC2InstanceFinder = function (ec2) {

        this.ec2 = ec2;
        this.instanceDescriptions = [];
        this.initialized = false;

        this.loadAllInstances = function (next) {
            if (this.initialized) return;
            var self = this;
            console.log('initializing');
            this.initialized = true;
            this.ec2.describeInstances(function (err, data) {
                if (!err) {
                    for (var i = 0; i < data.Reservations.length; i++) {
                        var reservation = data.Reservations[i];
                        for (var j = 0; j < reservation.Instances.length; j++) {
                            self.instanceDescriptions.push(reservation.Instances[j]);
                        }
                    }
                }
                next(err);
            });
        };

        this.findByHavingTags = function (filters, next) {
            var self = this;
            async.waterfall([
                function (next) {
                    self.loadAllInstances(next);
                },
                function (next) {
                    //console.log(self.instanceDescriptions);
                    var found = [];
                    for (var i = 0; i < self.instanceDescriptions.length; i++) {
                        var ec2 = self.instanceDescriptions[i];
                        if (ec2.Tags) {
                            var mappedTags = {};
                            ec2.Tags.forEach(function (val) {
                                mappedTags[val.Key.toLowerCase()] = val.Value.toLowerCase().split(',').map(function (v) {
                                    return v.trim();
                                });
                                mappedTags[val.Key.toLowerCase()].push(val.Value.toLowerCase().trim());
                            });
                            var comply = true;
                            filters.forEach(function (v) {
                                if (mappedTags[v.key]) {
                                    if (mappedTags[v.key].indexOf(v.value) == -1) {
                                        comply = false;
                                    }
                                } else {
                                    comply = false;
                                }
                            });
                            if (comply) {
                                found.push(self.instanceDescriptions[i]);
                            }
                        }
                    }
                    next(null, found);
                }
            ], function (err, data) {
                next(err, data);
            });

        }

        this.findByRunningAndHavingTags = function (filters, next) {
            var instances = [];
            var self = this;
            async.waterfall([
                    function (next) {
                        self.findByHavingTags(filters, next)
                    }]
                , function (err, data) {
                    if (!err) {
                        data.forEach(function (instance) {
                            if (instance.State && instance.State.Name == 'running') {
                                instances.push(instance);
                            }
                        });
                        //console.log(data);
                    }
                    next(err, instances);
                }
            );

        };

    };

    if (isNode) {
        module.exports = function (ec2) {
            return new EC2InstanceFinder(ec2);
        };
    }

})(typeof module === 'object' && module && typeof module.exports === 'object' && module.exports);