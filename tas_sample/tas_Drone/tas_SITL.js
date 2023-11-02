/**
 * Created by Wonseok Jung on 2023-07-24.
 */

const mqtt = require('mqtt');
const {nanoid} = require('nanoid');
const dgram = require("dgram");

const mavlink = require('./mavlibrary/mavlink');

/* USER CODE */
// for sensor
let tas = {
    client: {
        connected: false,
    },

    connection: {
        host: '127.0.0.1',
        port: 1883,
        endpoint: '',
        clean: true,
        reconnectPeriod: 2000,
        connectTimeout: 30000,
        queueQoSZero: false,
        clientId: 'tas_' + nanoid(15),
        username: 'keti_thyme',
        password: 'keti_thyme',
    },
};

let PORT1 = 14555; // output: SITL --> GCS
let PORT2 = 14556; // input : GCS --> SITL

let sitlUDP1 = null;
let sitlUDP2 = dgram.createSocket('udp4'); // to send commands received from gcs


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

                SitlUdpOpening();
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
                if (topic === recvDataTopic.gcs) {
                    if (sitlUDP2) {
                        sitlUDP2.send(message, 0, message.length, PORT2, tas.connection.host,
                            (err) => {
                                if (err) {
                                    console.log('UDP message send error', err);
                                    return;
                                }
                            });
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
        });
    }
};

let destroyConnection = () => {
    if (tas.client.connected) {
        try {
            if (Object.hasOwnProperty.call(tas.client, '__ob__')) {
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
function SitlUdpOpening() {
    if (!sitlUDP1) {
        sitlUDP1 = dgram.createSocket('udp4');
        sitlUDP1.bind(PORT1, tas.connection.host);

        sitlUDP1.on('listening', SitlUdpOpen);
        sitlUDP1.on('message', SitlUdpData);
        sitlUDP1.on('close', SitlUdpClose);
        sitlUDP1.on('error', SitlUdpError);
    }
}

function SitlUdpOpen() {
    console.log('UDP socket connect to ' + sitlUDP1.address().address + ':' + sitlUDP1.address().port);
}

function SitlUdpClose() {
    console.log('sitlUDP1 closed.');

    setTimeout(SitlUdpOpening, 2000);
}

function SitlUdpError(error) {
    console.log('sitlUDP1 error: ' + error.message);

    setTimeout(SitlUdpOpening, 2000);
}

let mavStrFromDrone = '';
let mavStrFromDroneLength = 0;
let mavVersion = 'unknown';
let mavVersionCheckFlag = false;

function SitlUdpData(data) {
    mavStrFromDrone += data.toString('hex').toLowerCase();

    while (mavStrFromDrone.length > 20) {
        let stx;
        let len;
        let mavLength;
        let sysid;
        let msgid;
        let mavPacket;

        if (!mavVersionCheckFlag) {
            stx = mavStrFromDrone.substring(0, 2);
            if (stx === 'fe') {
                len = parseInt(mavStrFromDrone.substring(2, 4), 16);
                mavLength = (6 * 2) + (len * 2) + (2 * 2);
                sysid = parseInt(mavStrFromDrone.substring(6, 8), 16);
                msgid = parseInt(mavStrFromDrone.substring(10, 12), 16);

                if (msgid === 0 && len === 9) { // HEARTBEAT
                    mavVersionCheckFlag = true;
                    mavVersion = 'v1';
                }

                if (mavStrFromDrone.length >= mavLength) {
                    mavPacket = mavStrFromDrone.substring(0, mavLength);

                    mavStrFromDrone = mavStrFromDrone.substring(mavLength);
                    mavStrFromDroneLength = 0;
                }
                else {
                    break;
                }
            }
            else if (stx === 'fd') {
                len = parseInt(mavStrFromDrone.substring(2, 4), 16);
                mavLength = (10 * 2) + (len * 2) + (2 * 2);

                sysid = parseInt(mavStrFromDrone.substring(10, 12), 16);
                msgid = parseInt(mavStrFromDrone.substring(18, 20) + mavStrFromDrone.substring(16, 18) + mavStrFromDrone.substring(14, 16), 16);

                if (msgid === 0 && len === 9) { // HEARTBEAT
                    mavVersionCheckFlag = true;
                    mavVersion = 'v2';
                }
                if (mavStrFromDrone.length >= mavLength) {
                    mavPacket = mavStrFromDrone.substring(0, mavLength);

                    mavStrFromDrone = mavStrFromDrone.substring(mavLength);
                    mavStrFromDroneLength = 0;
                }
                else {
                    break;
                }
            }
            else {
                mavStrFromDrone = mavStrFromDrone.substring(2);
            }
        }
        else {
            stx = mavStrFromDrone.substring(0, 2);
            if (mavVersion === 'v1' && stx === 'fe') {
                len = parseInt(mavStrFromDrone.substring(2, 4), 16);
                mavLength = (6 * 2) + (len * 2) + (2 * 2);

                if (mavStrFromDrone.length >= mavLength) {
                    mavPacket = mavStrFromDrone.substring(0, mavLength);
                    // console.log('v1', mavPacket);

                    doPublish(sendDataTopic.drone, mavPacket);

                    setTimeout(parseMavFromDrone, 0, mavPacket);

                    mavStrFromDrone = mavStrFromDrone.substring(mavLength);
                    mavStrFromDroneLength = 0;
                }
                else {
                    break;
                }
            }
            else if (mavVersion === 'v2' && stx === 'fd') {
                len = parseInt(mavStrFromDrone.substring(2, 4), 16);
                mavLength = (10 * 2) + (len * 2) + (2 * 2);

                if (mavStrFromDrone.length >= mavLength) {
                    mavPacket = mavStrFromDrone.substring(0, mavLength);
                    // console.log('v2', mavPacket);

                    doPublish(sendDataTopic.drone, mavPacket);

                    setTimeout(parseMavFromDrone, 0, mavPacket);

                    mavStrFromDrone = mavStrFromDrone.substring(mavLength);
                    mavStrFromDroneLength = 0;
                }
                else {
                    break;
                }
            }
            else {
                mavStrFromDrone = mavStrFromDrone.substring(2);
            }
        }
    }
}

let fc = {};
let flag_base_mode = 0;

function parseMavFromDrone(mavPacket) {
    try {
        let ver = mavPacket.substring(0, 2);
        let msg_len = parseInt(mavPacket.substring(2, 4), 16);
        let sys_id = '';
        let msg_id = '';
        let base_offset = 12;

        if (ver === 'fd') {
            sys_id = parseInt(mavPacket.substring(10, 12).toLowerCase(), 16);
            msg_id = parseInt(mavPacket.substring(18, 20) + mavPacket.substring(16, 18) + mavPacket.substring(14, 16), 16);
            base_offset = 20;
        }
        else {
            sys_id = parseInt(mavPacket.substring(6, 8).toLowerCase(), 16);
            msg_id = parseInt(mavPacket.substring(10, 12).toLowerCase(), 16);
            base_offset = 12;
        }
        my_system_id = sys_id;

        if (msg_id === mavlink.MAVLINK_MSG_ID_HEARTBEAT) { // #00 : HEARTBEAT
            let my_len = 9;
            let ar = mavPacket.split('');
            for (let i = 0; i < (my_len - msg_len); i++) {
                ar.splice(ar.length - 4, 0, '0');
                ar.splice(ar.length - 4, 0, '0');
            }
            mavPacket = ar.join('');

            let custom_mode = mavPacket.substring(base_offset, base_offset + 8).toLowerCase();
            base_offset += 8;
            let type = mavPacket.substring(base_offset, base_offset + 2).toLowerCase();
            base_offset += 2;
            let autopilot = mavPacket.substring(base_offset, base_offset + 2).toLowerCase();
            base_offset += 2;
            let base_mode = mavPacket.substring(base_offset, base_offset + 2).toLowerCase();
            base_offset += 2;
            let system_status = mavPacket.substring(base_offset, base_offset + 2).toLowerCase();
            base_offset += 2;
            let mavlink_version = mavPacket.substring(base_offset, base_offset + 2).toLowerCase();

            fc.heartbeat = {};
            fc.heartbeat.type = Buffer.from(type, 'hex').readUInt8(0);
            if (fc.heartbeat.type !== mavlink.MAV_TYPE_ADSB) {
                fc.heartbeat.autopilot = Buffer.from(autopilot, 'hex').readUInt8(0);
                fc.heartbeat.base_mode = Buffer.from(base_mode, 'hex').readUInt8(0);
                fc.heartbeat.custom_mode = Buffer.from(custom_mode, 'hex').readUInt32LE(0);
                fc.heartbeat.system_status = Buffer.from(system_status, 'hex').readUInt8(0);
                fc.heartbeat.mavlink_version = Buffer.from(mavlink_version, 'hex').readUInt8(0);
                if (tas.client.connected) {
                    tas.client.publish('/hb/' + conf.ae.name, JSON.stringify(fc.heartbeat));
                }
                let armStatus = (fc.heartbeat.base_mode & 0x80) === 0x80;

                if (_my_sortie_name === 'unknown') {
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
                else if (_my_sortie_name === 'disarm') {
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
                else if (_my_sortie_name === 'arm') {
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
        }
        else if (msg_id === mavlink.MAVLINK_MSG_ID_GLOBAL_POSITION_INT) { // #33
            let my_len = 28;
            let ar = mavPacket.split('');
            for (let i = 0; i < (my_len - msg_len); i++) {
                ar.splice(ar.length - 4, 0, '0');
                ar.splice(ar.length - 4, 0, '0');
            }
            mavPacket = ar.join('');

            let time_boot_ms = mavPacket.substring(base_offset, base_offset + 8).toLowerCase();
            base_offset += 8;
            let lat = mavPacket.substring(base_offset, base_offset + 8).toLowerCase();
            base_offset += 8;
            let lon = mavPacket.substring(base_offset, base_offset + 8).toLowerCase();
            base_offset += 8;
            let alt = mavPacket.substring(base_offset, base_offset + 8).toLowerCase();
            base_offset += 8;
            let relative_alt = mavPacket.substring(base_offset, base_offset + 8).toLowerCase();
            base_offset += 8;
            let vx = mavPacket.substring(base_offset, base_offset + 4).toLowerCase();
            base_offset += 4;
            let vy = mavPacket.substring(base_offset, base_offset + 4).toLowerCase();
            base_offset += 4;
            let vz = mavPacket.substring(base_offset, base_offset + 4).toLowerCase();
            base_offset += 4;
            let hdg = mavPacket.substring(base_offset, base_offset + 4).toLowerCase();

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

            if (tas.client.connected) {
                tas.client.publish('/gpi/' + conf.ae.name, JSON.stringify(fc.global_position_int));
            }
        }
    }
    catch (e) {
        console.log('[parseMavFromDrone Error]', e);
    }
}

/* */

