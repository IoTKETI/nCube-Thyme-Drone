/**
 * Created by ryeubi on 2015-08-31.
 * Updated 2017.03.06
 * Made compatible with Thyme v1.7.2
 */

const mqtt = require('mqtt');
const {nanoid} = require('nanoid');
const {SerialPort} = require('serialport');

const mavlink = require('./mavlibrary/mavlink');

/* USER CODE */
// for sensor
let tas = {
    client: {
        connected: false,
    },

    connection: {
        host: 'localhost',
        port: 1883,
        endpoint: '',
        clean: true,
        queueQoSZero: false,
        connectTimeout: 5000,
        reconnectPeriod: 2000,
        clientId: 'tas_' + nanoid(15),
        username: 'keti_thyme_tas',
        password: 'keti_thyme_tas',
    },
};

var mavPort = null;
var mavPortNum = 'COM4';
var mavBaudrate = '115200';

let sendDataTopic = {
    drone: '/thyme/drone',
    sortie: '/thyme/sortie'
};

let recvDataTopic = {
    gcs: '/gcs/cmd',
};

let _my_sortie_name = 'unknown';

/* */

let createConnection = () => {
    if (tas.client.connected) {
        console.log('Already connected --> destroyConnection')
        destroyConnection();
    }

    if (!tas.client.connected) {
        tas.client.loading = true;
        const {host, port, endpoint, ...options} = tas.connection;
        const connectUrl = `mqtt://${host}:${port}${endpoint}`
        try {
            tas.client = mqtt.connect(connectUrl, options);

            tas.client.on('connect', () => {
                console.log(host, 'Connection succeeded!');

                tas.client.connected = true;
                tas.client.loading = false;

                for (let topicName in recvDataTopic) {
                    if (recvDataTopic.hasOwnProperty(topicName)) {
                        doSubscribe(recvDataTopic[topicName]);
                    }
                }

                mavPortOpening();
            });

            tas.client.on('error', (error) => {
                console.log('Connection failed', error);

                destroyConnection();
            });

            tas.client.on('close', () => {
                console.log('Connection closed');

                destroyConnection();
            });

            tas.client.on('message', (topic, message) => {
                /* USER CODES */
                if(topic === recvDataTopic.gcs) {
                    if (mavPort !== null) {
                        mavPort.write(message);
                    }
                }
                /* */
            });
        }
        catch (error) {
            console.log('mqtt.connect error', error);
            tas.client.connected = false;
        }
    }
};

let doSubscribe = (topic) => {
    if (tas.client.connected) {
        const qos = 0;
        tas.client.subscribe(topic, {qos}, (error) => {
            if (error) {
                console.log('Subscribe to topics error', error)
                return;
            }

            console.log('Subscribe to topics (', topic, ')');
        });
    }
};

let doUnSubscribe = (topic) => {
    if (tas.client.connected) {
        tas.client.unsubscribe(topic, error => {
            if (error) {
                console.log('Unsubscribe error', error)
            }

            console.log('Unsubscribe to topics (', topic, ')');
        });
    }
};

let doPublish = (topic, payload) => {
    if (tas.client.connected) {
        tas.client.publish(topic, payload, 0, error => {
            if (error) {
                console.log('Publish error', error)
            }
            // console.log(topic, '-', payload);
        });
    }
};

let destroyConnection = () => {
    if (tas.client.connected) {
        try {
            if(Object.hasOwnProperty.call(tas.client, '__ob__')) {
                tas.client.end();
            }
            tas.client = {
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

createConnection();

/* USER CODE */
function mavPortOpening() {
    if (mavPort == null) {
        mavPort = new SerialPort({
            path: mavPortNum,
            baudRate: parseInt(mavBaudrate, 10),
        });

        mavPort.on('open', mavPortOpen);
        mavPort.on('close', mavPortClose);
        mavPort.on('error', mavPortError);
        mavPort.on('data', mavPortData);
    } else {
        if (mavPort.isOpen) {

        } else {
            mavPort.open();
        }
    }
}

function mavPortOpen() {
    console.log('mavPort open. ' + mavPortNum + ' Data rate: ' + mavBaudrate);
}

function mavPortClose() {
    console.log('mavPort closed.');

    setTimeout(mavPortOpening, 2000);
}

function mavPortError(error) {
    console.log('[mavPort error]: ' + error.message);

    setTimeout(mavPortOpening, 2000);
}

var mavStrFromDrone = '';
var mavStrFromDroneLength = 0;
var mavVersion = 'unknown';
var mavVersionCheckFlag = false;

function mavPortData(data) {
    mavStrFromDrone += data.toString('hex').toLowerCase();
    // console.log(mavStrFromDrone)

    while (mavStrFromDrone.length > 20) {
        if (!mavVersionCheckFlag) {
            var stx = mavStrFromDrone.substr(0, 2);
            if (stx === 'fe') {
                var len = parseInt(mavStrFromDrone.substr(2, 2), 16);
                var mavLength = (6 * 2) + (len * 2) + (2 * 2);
                var sysid = parseInt(mavStrFromDrone.substr(6, 2), 16);
                var msgid = parseInt(mavStrFromDrone.substr(10, 2), 16);

                if (msgid === 0 && len === 9) { // HEARTBEAT
                    mavVersionCheckFlag = true;
                    mavVersion = 'v1';
                }

                if (mavStrFromDrone.length >= mavLength) {
                    var mavPacket = mavStrFromDrone.substr(0, mavLength);

                    mavStrFromDrone = mavStrFromDrone.substr(mavLength);
                    mavStrFromDroneLength = 0;
                } else {
                    break;
                }
            } else if (stx === 'fd') {
                len = parseInt(mavStrFromDrone.substr(2, 2), 16);
                mavLength = (10 * 2) + (len * 2) + (2 * 2);

                sysid = parseInt(mavStrFromDrone.substr(10, 2), 16);
                msgid = parseInt(mavStrFromDrone.substr(18, 2) + mavStrFromDrone.substr(16, 2) + mavStrFromDrone.substr(14, 2), 16);

                if (msgid === 0 && len === 9) { // HEARTBEAT
                    mavVersionCheckFlag = true;
                    mavVersion = 'v2';
                }
                if (mavStrFromDrone.length >= mavLength) {
                    mavPacket = mavStrFromDrone.substr(0, mavLength);

                    mavStrFromDrone = mavStrFromDrone.substr(mavLength);
                    mavStrFromDroneLength = 0;
                } else {
                    break;
                }
            } else {
                mavStrFromDrone = mavStrFromDrone.substr(2);
            }
        } else {
            stx = mavStrFromDrone.substr(0, 2);
            if (mavVersion === 'v1' && stx === 'fe') {
                len = parseInt(mavStrFromDrone.substr(2, 2), 16);
                mavLength = (6 * 2) + (len * 2) + (2 * 2);

                if (mavStrFromDrone.length >= mavLength) {
                    mavPacket = mavStrFromDrone.substr(0, mavLength);
                    // console.log('v1', mavPacket);

                    doPublish(sendDataTopic.drone, mavPacket);

                    setTimeout(parseMavFromDrone, 0, mavPacket);

                    mavStrFromDrone = mavStrFromDrone.substr(mavLength);
                    mavStrFromDroneLength = 0;
                } else {
                    break;
                }
            } else if (mavVersion === 'v2' && stx === 'fd') {
                len = parseInt(mavStrFromDrone.substr(2, 2), 16);
                mavLength = (10 * 2) + (len * 2) + (2 * 2);

                if (mavStrFromDrone.length >= mavLength) {
                    mavPacket = mavStrFromDrone.substr(0, mavLength);
                    // console.log('v2', mavPacket);

                    doPublish(sendDataTopic.drone, mavPacket);

                    setTimeout(parseMavFromDrone, 0, mavPacket);

                    mavStrFromDrone = mavStrFromDrone.substr(mavLength);
                    mavStrFromDroneLength = 0;
                } else {
                    break;
                }
            } else {
                mavStrFromDrone = mavStrFromDrone.substr(2);
            }
        }
    }
}

var fc = {};
var flag_base_mode = 0;

function parseMavFromDrone(mavPacket) {
    try {
        var ver = mavPacket.substring(0, 2);
        var sys_id = '';
        var msg_id = '';
        var base_offset = 12;

        if (ver === 'fd') {
            sys_id = parseInt(mavPacket.substring(10, 12).toLowerCase(), 16);
            msg_id = parseInt(mavPacket.substring(18, 20) + mavPacket.substring(16, 18) + mavPacket.substring(14, 16), 16);
            base_offset = 20;
        } else {
            sys_id = parseInt(mavPacket.substring(6, 8).toLowerCase(), 16);
            msg_id = parseInt(mavPacket.substring(10, 12).toLowerCase(), 16);
            base_offset = 12;
        }
        my_system_id = sys_id;

        if (msg_id === mavlink.MAVLINK_MSG_ID_HEARTBEAT) { // #00 : HEARTBEAT
            var custom_mode = mavPacket.substring(base_offset, base_offset + 8).toLowerCase();
            base_offset += 8;
            var type = mavPacket.substring(base_offset, base_offset + 2).toLowerCase();
            base_offset += 2;
            var autopilot = mavPacket.substring(base_offset, base_offset + 2).toLowerCase();
            base_offset += 2;
            var base_mode = mavPacket.substring(base_offset, base_offset + 2).toLowerCase();
            base_offset += 2;
            var system_status = mavPacket.substring(base_offset, base_offset + 2).toLowerCase();
            base_offset += 2;
            var mavlink_version = mavPacket.substring(base_offset, base_offset + 2).toLowerCase();

            fc.heartbeat = {};
            fc.heartbeat.type = Buffer.from(type, 'hex').readUInt8(0);
            if (fc.heartbeat.type !== mavlink.MAV_TYPE_ADSB) {
                fc.heartbeat.autopilot = Buffer.from(autopilot, 'hex').readUInt8(0);
                fc.heartbeat.base_mode = Buffer.from(base_mode, 'hex').readUInt8(0);
                fc.heartbeat.custom_mode = Buffer.from(custom_mode, 'hex').readUInt32LE(0);
                fc.heartbeat.system_status = Buffer.from(system_status, 'hex').readUInt8(0);
                fc.heartbeat.mavlink_version = Buffer.from(mavlink_version, 'hex').readUInt8(0);

                let armStatus = (fc.heartbeat.base_mode & 0x80) === 0x80;

                if(_my_sortie_name === 'unknown') {
                    if (armStatus) {
                        flag_base_mode++;
                        if (flag_base_mode === 3) {
                            _my_sortie_name = 'arm';
                            doPublish(sendDataTopic.sortie, 'unknown-arm:' + fc.global_position_int.time_boot_ms.toString());
                        }
                    }
                    else {
                        flag_base_mode = 0;
                        _my_sortie_name = 'disarm';
                        doPublish(sendDataTopic.sortie, 'unknown-disarm:0');
                    }
                }
                else if(_my_sortie_name === 'disarm') {
                    if (armStatus) {
                        flag_base_mode++;
                        if (flag_base_mode === 3) {
                            _my_sortie_name = 'arm';
                            doPublish(sendDataTopic.sortie, 'disarm-arm:' + fc.global_position_int.time_boot_ms.toString());
                        }
                    }
                    else {
                        flag_base_mode = 0;
                        _my_sortie_name = 'disarm';
                    }
                }
                else if(_my_sortie_name === 'arm') {
                    if (armStatus) {
                        _my_sortie_name = 'arm';
                    }
                    else {
                        flag_base_mode = 0;
                        _my_sortie_name = 'disarm';
                        doPublish(sendDataTopic.sortie, 'arm-disarm:0');
                    }
                }
            }
        } else if (msg_id === mavlink.MAVLINK_MSG_ID_GLOBAL_POSITION_INT) { // #33
            var time_boot_ms = mavPacket.substring(base_offset, base_offset + 8).toLowerCase();
            base_offset += 8;
            var lat = mavPacket.substring(base_offset, base_offset + 8).toLowerCase();
            base_offset += 8;
            var lon = mavPacket.substring(base_offset, base_offset + 8).toLowerCase();
            base_offset += 8;
            var alt = mavPacket.substring(base_offset, base_offset + 8).toLowerCase();
            base_offset += 8;
            var relative_alt = mavPacket.substring(base_offset, base_offset + 8).toLowerCase();
            base_offset += 8;
            var vx = mavPacket.substring(base_offset, base_offset + 4).toLowerCase();
            base_offset += 4;
            var vy = mavPacket.substring(base_offset, base_offset + 4).toLowerCase();
            base_offset += 4;
            var vz = mavPacket.substring(base_offset, base_offset + 4).toLowerCase();
            base_offset += 4;
            var hdg = mavPacket.substring(base_offset, base_offset + 4).toLowerCase();

            fc.global_position_int = {};
            fc.global_position_int.time_boot_ms = Buffer.from(time_boot_ms, 'hex').readUInt32LE(0);
            fc.global_position_int.lat = Buffer.from(lat, 'hex').readInt32LE(0);
            fc.global_position_int.lon = Buffer.from(lon, 'hex').readInt32LE(0);
            fc.global_position_int.alt = Buffer.from(alt, 'hex').readInt32LE(0);
            fc.global_position_int.relative_alt = Buffer.from(relative_alt, 'hex').readInt32LE(0);
            fc.global_position_int.vx = Buffer.from(vx, 'hex').readInt16LE(0);
            fc.global_position_int.vy = Buffer.from(vy, 'hex').readInt16LE(0);
            fc.global_position_int.vz = Buffer.from(vz, 'hex').readInt16LE(0);
            fc.global_position_int.hdg = Buffer.from(hdg, 'hex').readUInt16LE(0);
        }
    } catch
        (e) {
        console.log('[parseMavFromDrone Error]', e);
    }
}
/* */
