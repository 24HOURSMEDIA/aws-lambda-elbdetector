;(function (isNode) {

    var EventMessage = function (id) {

        this.message_version= '1.0';
        this.event_source = '';
        this.type = 'event';
        this.event_id = id;
        this.target_type = 'ec2';
        this.target_instance = '';
        this.event_data = {

        };
        this.event_description = '';

    }


    if (isNode) {
        module.exports.createEventMessage = function (id) {
            var event = new EventMessage(id);

            return event;
        };
        module.exports.createEc2BackendDnsChangedEvent = function() {
            var msg = new EventMessage('backend_dns_changed');
            msg.event_description = 'event targeted at ec2 servers dependent on a backend server, when the backend server has changed its dns records.';
            return msg;
        }
    }

})
(typeof module === 'object' && module && typeof module.exports === 'object' && module.exports);