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

let tas_buffer = {};
exports.buffer = tas_buffer;


// for tas

let mqtt = require('mqtt');
let moment = require('moment');

/* USER CODE */
let getDataTopic = {
    drone: '/thyme/drone',
    sortie: '/thyme/sortie'
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
                if (topic === getDataTopic.drone) {
                    mqtt_client.publish(my_cnt_name, Buffer.from(message.toString(), 'hex'));
                    send_aggr_to_Mobius(my_cnt_name, message.toString(), 2000);
                }
                else if (topic === getDataTopic.sortie) {
                    let arr_message = message.toString().split(':');
                    my_sortie_name = arr_message[0];
                    let time_boot_ms = arr_message[1];

                    if (my_sortie_name === 'unknown-arm') { // 시작될 때 이미 드론이 시동이 걸린 상태
                        // 모비우스 조회해서 현재 sortie를 찾아서 설정함
                        let path = 'http://' + conf.cse.host + ':' + conf.cse.port + '/Mobius/' + drone_info.gcs + '/Drone_Data/' + drone_info.drone;
                        let cra = moment().utc().format('YYYYMMDD');

                        onem2m_client.getSortieLatest(path, cra, (status, uril) => {
                            if (uril.length === 0) {
                                // 현재 시동이 걸린 상태인데 오늘 생성된 sortie가 없다는 뜻이므로 새로 만듦
                                my_sortie_name = moment().format('YYYY_MM_DD_T_HH_mm');
                                prev_sortie_name = my_sortie_name;
                                my_cnt_name = my_parent_cnt_name + '/' + my_sortie_name;
                                onem2m_client.createSortieContainer(my_parent_cnt_name + '?rcn=0', my_sortie_name, time_boot_ms, 0, function (rsc, res_body, count) {
                                });
                            }
                            else {
                                my_sortie_name = uril[0].split('/')[4];
                                prev_sortie_name = my_sortie_name;
                                my_cnt_name = my_parent_cnt_name + '/' + my_sortie_name;
                            }
                        });
                    }
                    else if (my_sortie_name === 'unknown-disarm') { // 시작될 때 드론이 시동이 꺼진 상태
                        // disarm sortie 적용
                        my_sortie_name = 'disarm';
                        my_cnt_name = my_parent_cnt_name + '/' + my_sortie_name;
                        onem2m_client.createSortieContainer(my_parent_cnt_name + '?rcn=0', my_sortie_name, time_boot_ms, 0, function (rsc, res_body, count) {
                        });
                    }
                    else if (my_sortie_name === 'disarm-arm') { // 드론이 꺼진 상태에서 시동이 걸리는 상태
                        // 새로운 sortie 만들어 생성하고 설정
                        my_sortie_name = moment().format('YYYY_MM_DD_T_HH_mm');
                        prev_sortie_name = my_sortie_name;
                        my_cnt_name = my_parent_cnt_name + '/' + my_sortie_name;
                        onem2m_client.createSortieContainer(my_parent_cnt_name + '?rcn=0', my_sortie_name, time_boot_ms, 0, function (rsc, res_body, count) {
                        });
                    }
                    else if (my_sortie_name === 'arm-disarm') { // 드론이 시동 걸린 상태에서 시동이 꺼지는 상태
                        // disarm sortie 적용
                        my_sortie_name = 'disarm';
                        my_cnt_name = my_parent_cnt_name + '/' + my_sortie_name;
                    }
                }
                /* */
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
            if (Object.hasOwnProperty.call(conf.tas.client, '__ob__')) {
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


exports.ready_for_tas = function ready_for_tas() {
    createConnection();

    /* ***** USER CODE ***** */
    if (conf.sim === 'enable') {
        require('./tas_sample/tas_Drone/tas_SITL');
    }
    else {
        require('./tas_sample/tas_Drone/tas_Drone');
    }
    /* */
};

exports.send_to_tas = function send_to_tas(topicName, message) {
    if (setDataTopic.hasOwnProperty(topicName)) {
        conf.tas.client.publish(setDataTopic[topicName], message.toString())
    }
};

let aggr_content = {};

function send_aggr_to_Mobius(topic, content_each, gap) {
    // console.log(aggr_content);
    let timestamp;
    if (aggr_content.hasOwnProperty(topic)) {
        timestamp = moment().format('YYYY-MM-DDTHH:mm:ssSSS');
        aggr_content[topic][timestamp] = content_each;
    }
    else {
        aggr_content[topic] = {};
        timestamp = moment().format('YYYY-MM-DDTHH:mm:ssSSS');
        aggr_content[topic][timestamp] = content_each;

        setTimeout(() => {
            onem2m_client.create_cin(topic, 1, aggr_content[topic], this, (status, res_body, to, socket) => {
                console.log('x-m2m-rsc : ' + status + ' <----');
            });

            delete aggr_content[topic];
        }, gap, topic);
    }
}
