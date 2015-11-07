;(function (isNode) {

    var EventMessage = function () {

        this._schema = 'nl.v-m.event.sysop';
        this.type = 'event';
        this.event_id = '';
        this.target_instance = '';
        this.event_data = {};
    }


    if (isNode) {
        module.exports.createEventMessage = function () {
            return new EventMessage();
        };
    }

})
(typeof module === 'object' && module && typeof module.exports === 'object' && module.exports);