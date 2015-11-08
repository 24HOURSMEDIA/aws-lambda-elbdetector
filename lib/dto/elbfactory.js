;(function (isNode) {
    // ELB data transfer object to store on S3
    Elb = function () {
        this.type = 'aws:elbstatus';
        this.name = '';
        this.dns = '';
        this.ipv4 = [];
        this.prev_ipv4 = [];
        this.ipv6 = [];
        this.prev_ipv6 = [];
        // date of change
        this.changed = null;

        // return true if ipv4 differs from previous ipv4, same for ipv6
        // but only if both the previous ipv4's are empty.
        this.ipsHaveChanged = function () {
            var changed =
                    ((this.prev_ipv4.length > 0) && (this.ipv4.sort().toString() != this.prev_ipv4.sort().toString()))
                    || ((this.prev_ipv6.length > 0) && (this.ipv6.sort().toString() != this.prev_ipv6.sort().toString()))
                ;
            return changed;
        };

        // return a string that describes changes
        this.describeChanges = function () {
            var s = 'ip changes in elb ' + this.name + ' : ';
            if (this.ipv4.toString() != this.prev_ipv4.toString()) {
                s += 'IPV4s changed - current: ' + this.ipv4.toString() + ' Old ' + this.prev_ipv4.toString() + '. ';
                return s;
            } else {
                s += 'no IPV4s changed. ';
            }
            if (this.ipv6.toString() != this.prev_ipv6.toString()) {
                s += 'IPV6s changed - current: ' + this.ipv6.toString() + ' Old ' + this.prev_ipv6.toString();
                return s;
            } else {
                s += 'no IPV6s changed';
            }
            return s;
        };

        this.deserialize = function (json) {
            var data = JSON.parse(json);
            for (key in data) {
                if (this.hasOwnProperty(key)) {
                    this[key] = data[key];
                }
            }
        }
    }

    if (isNode) {
        module.exports.create = function () {
            return new Elb();
        };
    }

})(typeof module === 'object' && module && typeof module.exports === 'object' && module.exports);