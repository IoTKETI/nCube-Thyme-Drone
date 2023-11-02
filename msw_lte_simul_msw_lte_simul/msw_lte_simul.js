/**
 * Created by Il Yeup, Ahn in KETI on 2020-09-04.
 */

/**
 * Copyright (c) 2020, OCEAN
 * All rights reserved.
 * Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:
 * 1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
 * 3. The name of the author may not be used to endorse or promote products derived from this software without specific prior written permission.
 * THIS SOFTWARE IS PROVIDED BY THE AUTHOR ``AS IS'' AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

    // for TAS of mission

let mqtt = require('mqtt');
let fs = require('fs');
let spawn = require('child_process').spawn;
const {nanoid} = require('nanoid');
const util = require("util");

global.sh_man = require('./http_man');

let fc = {};
let config = {};

config.name = 'msw_lte_simul';
global.drone_info = '';

try {
    drone_info = JSON.parse(fs.readFileSync('../drone_info.json', 'utf8'));

    config.directory_name = config.name + '_' + config.name;
    // config.sortie_name = '/' + sortie_name;
    config.gcs = drone_info.gcs;
    config.drone = drone_info.drone;
    config.lib = [];
}
catch (e) {
    // config.sortie_name = '';
    config.directory_name = '';
    config.gcs = 'KETI_GCS';
    config.drone = 'KETI_Drone';
    config.lib = [];
}

// library 추가
let add_lib = {};
try {
    add_lib = JSON.parse(fs.readFileSync('./lib_lte_simul.json', 'utf8'));
    config.lib.push(add_lib);
}
catch (e) {
    add_lib = {
        name: 'lib_lte_simul',
        target: 'armv6',
        description: "[name] [portnum] [baudrate]",
        scripts: './lib_lte_simul',
        data: ['LTE'],
        control: ['Control']
    };
    config.lib.push(add_lib);
}

// msw가 muv로 부터 트리거를 받는 용도
// 명세에 sub_container 로 표기
let msw_sub_mobius_topic = [];

let msw_sub_fc_topic = [];
msw_sub_fc_topic.push('/gpi/' + drone_info.id);

let msw_sub_lib_topic = [];

let t_id = null;

function init() {
    if (config.lib.length > 0) {
        for (let idx in config.lib) {
            if (config.lib.hasOwnProperty(idx)) {
                if (msw_mqtt_client) {
                    for (let i = 0; i < config.lib[idx].control.length; i++) {
                        let sub_container_name = config.lib[idx].control[i];
                        let _topic = '/Mobius/' + config.gcs + '/Mission_Data/' + config.drone + '/' + config.name + '/' + sub_container_name;
                        msw_mqtt_client.subscribe(_topic);
                        msw_sub_mobius_topic.push(_topic);
                        console.log('[msw_mqtt] msw_sub_mobius_topic[' + i + ']: ' + _topic);
                    }

                    for (let i = 0; i < config.lib[idx].data.length; i++) {
                        let container_name = config.lib[idx].data[i];
                        let _topic = '/TAS/data/' + config.lib[idx].name + '/' + container_name;
                        msw_sub_lib_topic.push(_topic);
                        console.log('[lib_mqtt] msw_sub_lib_topic[' + i + ']: ' + _topic);
                    }
                }

                t_id = setInterval(gen_LTEData, 2000, '/TAS/data/lib_lte_simul/LTE');

                // setTimeout(runLib, 1000 + parseInt(Math.random() * 10), JSON.parse(JSON.stringify(obj_lib)));
            }
        }
    }
}

// function runLib(obj_lib) {
//     try {
//         let scripts_arr = obj_lib.scripts.split(' ');
//         if (config.directory_name == '') {
//
//         } else {
//             scripts_arr[0] = scripts_arr[0].replace('./', '');
//             scripts_arr[0] = './' + scripts_arr[0];
//         }
//
//         let run_lib = spawn(scripts_arr[0], scripts_arr.slice(1));
//
//         run_lib.stdout.on('data', function (data) {
//             console.log('stdout: ' + data);
//         });
//
//         run_lib.stderr.on('data', function (data) {
//             console.log('stderr: ' + data);
//         });
//
//         run_lib.on('exit', function (code) {
//             console.log('exit: ' + code);
//
//             setTimeout(runLib, 3000, obj_lib)
//         });
//
//         run_lib.on('error', function (code) {
//             console.log('error: ' + code);
//         });
//     } catch (e) {
//         console.log(e.message);
//     }
// }

let msw_mqtt_client = null;

msw_mqtt_connect('localhost', 1883);

function msw_mqtt_connect(broker_ip, port) {
    if (!msw_mqtt_client) {
        let connectOptions = {
            host: broker_ip,
            port: port,
            protocol: "mqtt",
            keepalive: 10,
            clientId: 'mqttjs_' + config.drone + '_' + config.name + '_' + nanoid(15),
            protocolId: "MQTT",
            protocolVersion: 4,
            clean: true,
            reconnectPeriod: 2000,
            connectTimeout: 2000,
            rejectUnauthorized: false
        };

        msw_mqtt_client = mqtt.connect(connectOptions);

        msw_mqtt_client.on('connect', function () {
            console.log('[msw_mqtt_connect] connected to ' + broker_ip);
            let noti_topic = util.format('/oneM2M/req/+/S%s/#', drone_info.id);
            msw_mqtt_client.subscribe(noti_topic, function () {
                console.log('[msw_mqtt_connect] noti_topic is subscribed:  ' + noti_topic);
            });
            for (let idx in msw_sub_fc_topic) {
                if (msw_sub_fc_topic.hasOwnProperty(idx)) {
                    msw_mqtt_client.subscribe(msw_sub_fc_topic[idx]);
                    console.log('[msw_mqtt_client] msw_sub_fc_topic[' + idx + ']: ' + msw_sub_fc_topic[idx]);
                }
            }
        });

        msw_mqtt_client.on('message', function (topic, message) {
            if (msw_sub_mobius_topic.includes(topic)) {
                setTimeout(on_receive_from_muv, parseInt(Math.random() * 5), topic, message.toString());
            }
            else if (msw_sub_fc_topic.includes(topic)) {
                for (let idx in msw_sub_fc_topic) {
                    if (msw_sub_fc_topic.hasOwnProperty(idx)) {
                        if (topic === msw_sub_fc_topic[idx]) {
                            setTimeout(on_process_fc_data, parseInt(Math.random() * 5), topic, message.toString());
                            break;
                        }
                    }
                }
            }
            else {
                if (topic.includes('/oneM2M/req/')) {
                    var jsonObj = JSON.parse(message.toString());

                    let patharr = jsonObj.pc['m2m:sgn'].sur.split('/');
                    let lib_ctl_topic = '/TAS/control/' + patharr[patharr.length - 3].replace('msw_', 'lib_') + '/' + patharr[patharr.length - 2];

                    if (patharr[patharr.length - 3] === config.name) {
                        if (jsonObj.pc['m2m:sgn'].nev) {
                            if (jsonObj.pc['m2m:sgn'].nev.rep) {
                                if (jsonObj.pc['m2m:sgn'].nev.rep['m2m:cin']) {
                                    let cinObj = jsonObj.pc['m2m:sgn'].nev.rep['m2m:cin']
                                    if (getType(cinObj.con) === 'string') {
                                        if (cinObj.con === 'ON') {
                                            t_id = setInterval(gen_LTEData, 2000, '/TAS/data/lib_lte_simul/LTE');
                                        }
                                        else {
                                            clearInterval(t_id);
                                            t_id = null;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                else {
                }
            }
        });

        msw_mqtt_client.on('error', function (err) {
            console.log(err.message);
        });
    }
}

function on_receive_from_muv(topic, str_message) {
    // console.log('[' + topic + '] ' + str_message);

    parseControlMission(topic, str_message);
}

function on_receive_from_lib(topic, str_message) {
    // console.log('[' + topic + '] ' + str_message);

    parseDataMission(topic, str_message);
}

function on_process_fc_data(topic, str_message) {
    // console.log('[' + topic + '] ' + str_message);

    let topic_arr = topic.split('/');
    fc[topic_arr[1]] = JSON.parse(str_message);

    parseFcData(topic, str_message);
}

setTimeout(init, 1000);

// 유저 디파인 미션 소프트웨어 기능
///////////////////////////////////////////////////////////////////////////////
function parseDataMission(topic, str_message) {
    try {
        // User define Code
        let obj_lib_data = JSON.parse(str_message);

        if (fc.hasOwnProperty('gpi')) {
            Object.assign(obj_lib_data, JSON.parse(JSON.stringify(fc['gpi'])));
        }
        str_message = JSON.stringify(obj_lib_data);
        ///////////////////////////////////////////////////////////////////////

        let topic_arr = topic.split('/');
        let data_topic = '/Mobius/' + config.gcs + '/Mission_Data/' + config.drone + '/' + config.name + '/' + topic_arr[topic_arr.length - 1];
        // msw_mqtt_client.publish(data_topic + '/' + sortie_name, str_message);
        msw_mqtt_client.publish(data_topic, str_message);
        // sh_man.crtci(data_topic + '?rcn=0', 0, str_message, null, function (rsc, res_body, parent, socket) {
        //     if (rsc === '2001') {
        //         setTimeout(mon_local_db, 500, data_topic);
        //     } else {
        //         lte_data.insert(JSON.parse(str_message));
        //     }
        // });
    }
    catch (e) {
        console.log('[parseDataMission] data format of lib is not json');
    }
}

///////////////////////////////////////////////////////////////////////////////

function parseControlMission(topic, str_message) {
    try {
        // User define Code
        if (str_message === 'ON') {
            t_id = setInterval(gen_LTEData, 2000, '/TAS/data/lib_lte_simul/LTE');
        }
        else {
            clearInterval(t_id);
            t_id = null;
        }
    }
    catch (e) {
        console.log('[parseControlMission] data format of lib is not json');
    }
}

function parseFcData(topic, str_message) {
    // User define Code
    // let topic_arr = topic.split('/');
    // if(topic_arr[topic_arr.length-1] == 'global_position_int') {
    //     let _topic = '/MUV/control/' + config.lib[0].name + '/' + config.lib[1].control[1]; // 'Req_enc'
    //     msw_mqtt_client.publish(_topic, str_message);
    // }
    ///////////////////////////////////////////////////////////////////////
}

function gen_LTEData(topic) {
    let LteSimulData = JSON.stringify({
        //         // LGU
        //         Frequency: "2600",
        //         Band: "5",
        //         BW: "10MHz",
        //         "Cell ID": "34(0x22)",
        //         RSRP: rsrp,
        //         RSSI: rssi,
        //         RSRQ: rsrq,
        //         BLER: "0dB",
        //         "Tx Power": "4",
        //         PLMN: "450f06",
        //         TAC: "17117",
        //         "DRX cycle length": "1280",
        //         "EMM state": "REGISTERED",
        //         "RRC state": "CONNECTED",
        //         "Net OP Mode": "CS_PS_MODE1",
        //         "EMM Cause": "18",
        //         "ESM Cause": "0",
        //         "(1)IPv4": "100.66.120.66",
        //         "(2)IPv4": "10.174.126.112"

        //         // KT
        //         PLMN: "450f08",
        //         Band: "3",
        //         EARFCN: "1550",
        //         Bandwidth: "20MHz",
        //         PCI: "250",
        //         "Cell-ID": "c1a5-05",
        //         GUTI: "450f08-8101-24-cc96ddbf",
        //         TAC: "1050",
        //         RSRP: rsrp,
        //         RSRQ: rsrq,
        //         RSSI: rssi,
        //         SINR: "-2.8dB",
        //         DRX: "1280",
        //         "RRC state": "CONNECTED",
        //         "EMM state": "REGISTERED",
        //         "EMM Cause": "0",
        //         "ESM Cause": "0",
        //         "Tx Power": "-4.2",
        //         BLER: "0",

        // SKT
        "EARFCN(DL/UL)": "2500/20500",
        RF_state: "RXTX",
        BAND: "5",
        BW: "10MHz",
        PLMN: "45005",
        TAC: "13620",
        "Cell(PCI)": "1227-35(417)",
        "ESM CAUSE": "0",
        DRX: "640ms",
        RSRP: -(Math.floor(Math.random() * (140 - 44 + 1)) + 44),
        RSRQ: -(Math.floor(Math.random() * (99 - 35 + 1)) + 35),
        RSSI: -(Math.floor(Math.random() * (19.5 - 3 + 1)) + 3),
        L2W: "-",
        RI: "0",
        CQI: "0",
        STATUS: "SRV/REGISTERED",
        "SUB STATUS": "NORMAL_SERVICE",
        RRC: "CONNECTED",
        SVC: "CS_PS",
        SINR: "12.8",
        "Tx Pwr": "-21",
        TMSI: "e8352880",
        IP: "27.173.20.58",
        "AVG RSRP": "-70",
        ANTBAR: "4",
        IMSI: "450051270994339",
        MSISDN: "01227091531",
    })
    setTimeout(on_receive_from_lib, 100, topic, LteSimulData)
}
