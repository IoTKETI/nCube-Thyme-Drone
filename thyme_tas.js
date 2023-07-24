/**
 * Created by Il Yeup, Ahn in KETI on 2017-02-25.
 */

/**
 * Copyright (c) 2018, OCEAN
 * All rights reserved.
 * Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:
 * 1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
 * 3. The name of the author may not be used to endorse or promote products derived from this software without specific prior written permission.
 * THIS SOFTWARE IS PROVIDED BY THE AUTHOR ``AS IS'' AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

// for TAS

global.socket_arr = {};

var tas_buffer = {};
exports.buffer = tas_buffer;


// for tas

let mqtt = require('mqtt');
let moment = require('moment');

/* USER CODE */
let getDataTopic = {
    drone: '/thyme/drone',
};

let setDataTopic = {
    gcs: '/gcs/cmd',
};
/* */

let createConnection = () => {
    if (conf.tas.client.connected) {
        console.log('Already connected --> destroyConnection')
        destroyConnection();
    }

    if (!conf.tas.client.connected) {
        conf.tas.client.loading = true;
        const {host, port, endpoint, ...options} = conf.tas.connection;
        const connectUrl = `mqtt://${host}:${port}${endpoint}`
        try {
            conf.tas.client = mqtt.connect(connectUrl, options);

            conf.tas.client.on('connect', () => {
                console.log(host, 'Connection succeeded!');

                conf.tas.client.connected = true;
                conf.tas.client.loading = false;

                for (let topicName in getDataTopic) {
                    if (getDataTopic.hasOwnProperty(topicName)) {
                        doSubscribe(getDataTopic[topicName]);
                    }
                }
            });

            conf.tas.client.on('error', (error) => {
                console.log('Connection failed', error);

                destroyConnection();
            });

            conf.tas.client.on('close', () => {
                console.log('Connection closed');

                destroyConnection();
            });

            conf.tas.client.on('message', (topic, message) => {
                let content = null;
                let parent = null;

                /* USER CODES */
                if(topic === getDataTopic.drone) {
                    send_aggr_to_Mobius(my_cnt_name, message.toString(), 2000);
                }
                /* */

                if(content !== null) {
                    onem2m_client.create_cin(parent, 1, JSON.stringify(content), this, function (status, res_body, to, socket) {
                        console.log('x-m2m-rsc : ' + status + ' <----');
                    });
                }
            });
        }
        catch (error) {
            console.log('mqtt.connect error', error);
            conf.tas.client.connected = false;
        }
    }
};

let doSubscribe = (topic) => {
    if (conf.tas.client.connected) {
        const qos = 0;
        conf.tas.client.subscribe(topic, {qos}, (error) => {
            if (error) {
                console.log('Subscribe to topics error', error)
                return;
            }

            console.log('Subscribe to topics (', topic, ')');
        });
    }
};

let doUnSubscribe = (topic) => {
    if (conf.tas.client.connected) {
        conf.tas.client.unsubscribe(topic, error => {
            if (error) {
                console.log('Unsubscribe error', error)
            }

            console.log('Unsubscribe to topics (', topic, ')');
        });
    }
};

let doPublish = (topic, payload) => {
    if (conf.tas.client.connected) {
        conf.tas.client.publish(topic, payload, 0, error => {
            if (error) {
                console.log('Publish error', error)
            }
        });
    }
};

let destroyConnection = () => {
    if (conf.tas.client.connected) {
        try {
            if(Object.hasOwnProperty.call(conf.tas.client, '__ob__')) {
                conf.tas.client.end();
            }
            conf.tas.client = {
                connected: false,
                loading: false
            }
            console.log(this.name, 'Successfully disconnected!');
        }
        catch (error) {
            console.log('Disconnect failed', error.toString())
        }
    }
};


exports.ready_for_tas = function ready_for_tas () {
    createConnection();

    /* ***** USER CODE ***** */
    if(conf.sim === 'enable') {
        require('./tas_sample/tas_Drone/tas_SITL');
    } else {
        require('./tas_sample/tas_Drone/tas_Drone');
    }
    /* */
};

exports.send_to_tas = function send_to_tas (topicName, message) {
    if(setDataTopic.hasOwnProperty(topicName)) {
        conf.tas.client.publish(setDataTopic[topicName], message.toString())
    }
};

var aggr_content = {};

function send_aggr_to_Mobius(topic, content_each, gap) {
    // console.log(aggr_content);
    if (aggr_content.hasOwnProperty(topic)) {
        var timestamp = moment().format('YYYY-MM-DDTHH:mm:ssSSS');
        aggr_content[topic][timestamp] = content_each;
    } else {
        aggr_content[topic] = {};
        timestamp = moment().format('YYYY-MM-DDTHH:mm:ssSSS');
        aggr_content[topic][timestamp] = content_each;

        setTimeout(function () {
            onem2m_client.create_cin(topic, 1, aggr_content[topic], this, function (status, res_body, to, socket) {
                console.log('x-m2m-rsc : ' + status + ' <----');
            });

            delete aggr_content[topic];
        }, gap, topic);
    }
}
