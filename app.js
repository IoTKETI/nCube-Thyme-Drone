/**
 * Copyright (c) 2018, OCEAN
 * All rights reserved.
 * Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:
 * 1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
 * 3. The name of the author may not be used to endorse or promote products derived from this software without specific prior written permission.
 * THIS SOFTWARE IS PROVIDED BY THE AUTHOR ``AS IS'' AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

/**
 * Created by ryeubi on 2015-08-31.
 */

const Onem2mClient = require('./onem2m_client');

const thyme_tas = require('./thyme_tas');
const fs = require("fs");
const {spawn, exec} = require("child_process");

let options = {
    protocol: conf.useprotocol,
    host: conf.cse.host,
    port: conf.cse.port,
    mqttport: conf.cse.mqttport,
    wsport: conf.cse.wsport,
    cseid: conf.cse.id,
    aei: conf.ae.id,
    aeport: conf.ae.port,
    bodytype: conf.ae.bodytype,
    usesecure: conf.usesecure,
};

global.onem2m_client = new Onem2mClient(options);

const retry_interval = 2500;
const normal_interval = 100;

global.my_sortie_name = 'disarm';
let my_gcs_name = '';
global.my_parent_cnt_name = '';
global.my_cnt_name = '';
let my_command_parent_name = '';
let my_command_name = '';
global.msw_data_topic = [];
global.msw_control_topic = [];

let my_drone_type = 'ardupilot';
global.my_system_id = 8;

global.drone_info = {};

let request_count = 0;

function git_clone(mission_name, directory_name, repository_url) {
    console.log('[Git] Mission(' + mission_name + ') cloning...');
    try {
        require('fs-extra').removeSync('./' + directory_name);
    }
    catch (e) {
        console.log(e.message);
    }

    let gitClone = spawn('git', ['clone', repository_url, directory_name]);

    gitClone.stdout.on('data', (data) => {
        console.log('stdout: ' + data);
    });

    gitClone.stderr.on('data', (data) => {
        console.log('stderr: ' + data);
    });

    gitClone.on('exit', (code) => {
        console.log('exit: ' + code);

        setTimeout(npm_install, 5000, mission_name, directory_name);
    });

    gitClone.on('error', (code) => {
        console.log('error: ' + code);
    });
}

function git_pull(mission_name, directory_name) {
    console.log('[Git] Mission(' + mission_name + ') pull...');
    try {
        let cmd;
        if (process.platform === 'win32') {
            cmd = 'git';
        }
        else {
            cmd = 'git';
        }

        let gitPull = spawn(cmd, ['pull'], {cwd: process.cwd() + '/' + directory_name});

        gitPull.stdout.on('data', (data) => {
            console.log('stdout: ' + data);
        });

        gitPull.stderr.on('data', (data) => {
            console.log('stderr: ' + data);
            if (data.includes('Could not resolve host')) {
                setTimeout(npm_install, 1000, mission_name, directory_name);
            }
        });

        gitPull.on('exit', (code) => {
            console.log('exit: ' + code);

            setTimeout(npm_install, 1000, mission_name, directory_name);
        });

        gitPull.on('error', (code) => {
            console.log('error: ' + code);
        });
    }
    catch (e) {
        console.log(e.message);
    }
}

function npm_install(mission_name, directory_name) {
    console.log('npm_install [ ' + mission_name + ' ]');
    try {
        let cmd;
        if (process.platform === 'win32') {
            cmd = 'npm.cmd';
        }
        else {
            cmd = 'npm';
        }

        let npmInstall = spawn(cmd, ['install'], {cwd: process.cwd() + '/' + directory_name});

        npmInstall.stdout.on('data', (data) => {
            console.log('stdout: ' + data);
        });

        npmInstall.stderr.on('data', (data) => {
            console.log('stderr: ' + data);
        });

        npmInstall.on('exit', (code) => {
            console.log('exit: ' + code);

            setTimeout(fork_msw, 10, mission_name, directory_name)
        });

        npmInstall.on('error', (code) => {
            console.log('error: ' + code);

            setTimeout(npm_install, 1000, mission_name, directory_name);
        });
    }
    catch (e) {
        console.log(e.message);
    }
}

function fork_msw(mission_name, directory_name) {
    console.log('fork_msw [ ' + mission_name + ' ]');
    let executable_name = directory_name.replace(mission_name + '_', '');

    exec('pm2 list', (error, stdout, stderr) => {
        if (error) {
            console.log('error: ' + error);
        }
        if (stdout) {
            console.log('stdout: ' + stdout);
            if (!stdout.includes(mission_name)) {
                let nodeMsw = exec('pm2 start ' + executable_name + '.js', {cwd: process.cwd() + '/' + directory_name});

                nodeMsw.stdout.on('data', (data) => {
                    console.log('stdout: ' + data);
                });

                nodeMsw.stderr.on('data', (data) => {
                    console.log('stderr: ' + data);
                });

                nodeMsw.on('exit', (code) => {
                    console.log('exit: ' + code);
                });

                nodeMsw.on('error', (code) => {
                    console.log('error: ' + code);

                    setTimeout(npm_install, 10, directory_name);
                });
            }
        }
        if (stderr) {
            console.log('stderr: ' + stderr);
        }
    });
}

function ae_response_action(status, res_body, callback) {
    var aeid = res_body['m2m:ae']['aei'];
    conf.ae.id = aeid;
    callback(status, aeid);
}

function create_cnt_all(count, callback) {
    if (conf.cnt.length === 0) {
        callback(2001, count);
    }
    else {
        if (conf.cnt.hasOwnProperty(count)) {
            var parent = conf.cnt[count].parent;
            var rn = conf.cnt[count].name;
            onem2m_client.create_cnt(parent, rn, count, (rsc, res_body, count) => {
                if (rsc === 5106 || rsc === 2001 || rsc === 4105) {
                    create_cnt_all(++count, (status, count) => {
                        callback(status, count);
                    });
                }
                else {
                    callback(9999, count);
                }
            });
        }
        else {
            callback(2001, count);
        }
    }
}

function delete_sub_all(count, callback) {
    if (conf.sub.length === 0) {
        callback(2001, count);
    }
    else {
        if (conf.sub.hasOwnProperty(count)) {
            var target = conf.sub[count].parent + '/' + conf.sub[count].name;
            onem2m_client.delete_sub(target, count, function (rsc, res_body, count) {
                if (rsc === 5106 || rsc === 2002 || rsc === 2000 || rsc === 4105 || rsc === 4004) {
                    delete_sub_all(++count, (status, count) => {
                        callback(status, count);
                    });
                }
                else {
                    callback(9999, count);
                }
            });
        }
        else {
            callback(2001, count);
        }
    }
}

function create_sub_all(count, callback) {
    if (conf.sub.length === 0) {
        callback(2001, count);
    }
    else {
        if (conf.sub.hasOwnProperty(count)) {
            var parent = conf.sub[count].parent;
            var rn = conf.sub[count].name;
            var nu = conf.sub[count].nu;
            onem2m_client.create_sub(parent, rn, nu, count, (rsc, res_body, count) => {
                if (rsc === 5106 || rsc === 2001 || rsc === 4105) {
                    create_sub_all(++count, (status, count) => {
                        callback(status, count);
                    });
                }
                else {
                    callback('9999', count);
                }
            });
        }
        else {
            callback(2001, count);
        }
    }
}

function retrieve_my_cnt_name() {
    onem2m_client.retrieve_cnt('/Mobius/' + conf.ae.approval_gcs + '/approval/' + conf.ae.name + '/la', 0, function (rsc, res_body, count) {
        if (rsc === 2000) {
            drone_info = res_body[Object.keys(res_body)[0]].con;
            // console.log(drone_info);
            drone_info.id = conf.ae.name;
            fs.writeFileSync('./drone_info.json', JSON.stringify(drone_info, null, 4), 'utf8');

            conf.sub = [];
            conf.cnt = [];
            conf.fc = [];

            if (drone_info.hasOwnProperty('gcs')) {
                my_gcs_name = drone_info.gcs;
            }
            else {
                my_gcs_name = 'nCube_Drone';
            }

            if (drone_info.hasOwnProperty('host')) {
                conf.cse.host = drone_info.host;
            }
            else {
            }

            console.log("gcs host is " + conf.cse.host);

            var info = {};
            info.parent = '/Mobius/' + drone_info.gcs;
            info.name = 'Drone_Data';
            conf.cnt.push(JSON.parse(JSON.stringify(info)));

            info = {};
            info.parent = '/Mobius/' + drone_info.gcs + '/Drone_Data';
            info.name = drone_info.drone;
            conf.cnt.push(JSON.parse(JSON.stringify(info)));

            info.parent = '/Mobius/' + drone_info.gcs + '/Drone_Data/' + drone_info.drone;
            info.name = my_sortie_name;
            conf.cnt.push(JSON.parse(JSON.stringify(info)));

            my_parent_cnt_name = info.parent;
            my_cnt_name = my_parent_cnt_name + '/' + info.name;

            if (drone_info.hasOwnProperty('type')) {
                my_drone_type = drone_info.type;
            }
            else {
                my_drone_type = 'ardupilot';
            }

            if (drone_info.hasOwnProperty('system_id')) {
                my_system_id = drone_info.system_id;
            }
            else {
                my_system_id = 8;
            }

            if (drone_info.hasOwnProperty('mission')) {
                var info = {};
                info.parent = '/Mobius/' + drone_info.gcs;
                info.name = 'Mission_Data';
                conf.cnt.push(JSON.parse(JSON.stringify(info)));

                info = {};
                info.parent = '/Mobius/' + drone_info.gcs + '/Mission_Data';
                info.name = drone_info.drone;
                conf.cnt.push(JSON.parse(JSON.stringify(info)));

                for (let mission_name in drone_info.mission) {
                    if (drone_info.mission.hasOwnProperty(mission_name)) {
                        info = {};
                        info.parent = '/Mobius/' + drone_info.gcs + '/Mission_Data/' + drone_info.drone;
                        info.name = mission_name;
                        conf.cnt.push(JSON.parse(JSON.stringify(info)));

                        let chk_cnt = 'container';
                        if (drone_info.mission[mission_name].hasOwnProperty(chk_cnt)) {
                            for (let idx in drone_info.mission[mission_name][chk_cnt]) {
                                if (drone_info.mission[mission_name][chk_cnt].hasOwnProperty(idx)) {
                                    let container_name = drone_info.mission[mission_name][chk_cnt][idx].split(':')[0];
                                    info = {};
                                    info.parent = '/Mobius/' + drone_info.gcs + '/Mission_Data/' + drone_info.drone + '/' + mission_name;
                                    info.name = container_name;

                                    conf.cnt.push(JSON.parse(JSON.stringify(info)));

                                    msw_data_topic.push(info.parent + '/' + info.name);
                                }
                            }
                        }

                        chk_cnt = 'sub_container';
                        if (drone_info.mission[mission_name].hasOwnProperty(chk_cnt)) {
                            for (let idx in drone_info.mission[mission_name][chk_cnt]) {
                                if (drone_info.mission[mission_name][chk_cnt].hasOwnProperty(idx)) {
                                    let container_name = drone_info.mission[mission_name][chk_cnt][idx];
                                    info = {};
                                    info.parent = '/Mobius/' + drone_info.gcs + '/Mission_Data/' + drone_info.drone + '/' + mission_name;
                                    info.name = container_name;
                                    conf.cnt.push(JSON.parse(JSON.stringify(info)));

                                    info = {};
                                    info.parent = '/Mobius/' + drone_info.gcs + '/Mission_Data/' + drone_info.drone + '/' + mission_name + '/' + container_name;
                                    info.name = 'sub_msw';
                                    info.nu = 'mqtt://' + conf.cse.host + ':' + conf.cse.mqttport + '/' + drone_info.gcs + '/Mission_Data/' + drone_info.drone + '/' + mission_name + '/' + container_name + '?ct=json';
                                    conf.sub.push(JSON.parse(JSON.stringify(info)));
                                    // receiver => subscribe topic: /mytopic/subtopic/# or /mytopic/subtopic/json
                                }
                            }
                        }

                        chk_cnt = 'git';
                        if (drone_info.mission[mission_name].hasOwnProperty(chk_cnt)) {
                            let repo_arr = drone_info.mission[mission_name][chk_cnt].split('/');
                            let directory_name = mission_name + '_' + repo_arr[repo_arr.length - 1].replace('.git', '');
                            try {
                                if (fs.existsSync('./' + directory_name)) {
                                    setTimeout(git_pull, 10, mission_name, directory_name);
                                }
                                else {
                                    setTimeout(git_clone, 10, mission_name, directory_name, drone_info.mission[mission_name][chk_cnt]);
                                }
                            }
                            catch (e) {
                                console.log(e.message);
                            }
                        }
                    }
                }
            }

            var info = {};
            info.parent = '/Mobius/' + drone_info.gcs;
            info.name = 'GCS_Data';
            conf.cnt.push(JSON.parse(JSON.stringify(info)));

            info = {};
            info.parent = '/Mobius/' + drone_info.gcs + '/GCS_Data';
            info.name = drone_info.drone;
            conf.cnt.push(JSON.parse(JSON.stringify(info)));

            my_command_parent_name = info.parent;
            my_command_name = my_command_parent_name + '/' + info.name;

            if (mqtt_client) {
                mqtt_client.subscribe(my_command_name, () => {
                    console.log('subscribe my_command_name as ' + my_command_name);
                });
            }
            // MQTT_SUBSCRIPTION_ENABLE = 1;
            sh_state = 'crtct';
            request_count = 0;
            setTimeout(setup_resources, normal_interval, sh_state);
        }
        else {
            console.log('x-m2m-rsc : ' + rsc + ' <----' + res_body);
            setTimeout(setup_resources, retry_interval, sh_state);
        }
    });
}

setTimeout(setup_resources, 100, sh_state);

function setup_resources(_status) {
    sh_state = _status;

    console.log('[status] : ' + _status);

    if (_status === 'rtvct') {
        retrieve_my_cnt_name();
    }
    else if (_status === 'crtae') {
        onem2m_client.create_ae(conf.ae.parent, conf.ae.name, conf.ae.appid, (status, res_body) => {
            console.log(res_body);
            if (status === 2001) {
                ae_response_action(status, res_body, (status, aeid) => {
                    console.log('x-m2m-rsc : ' + status + ' - ' + aeid + ' <----');
                    request_count = 0;

                    setTimeout(setup_resources, 100, 'rtvae');
                });
            }
            else if (status === 5106 || status === 4105) {
                console.log('x-m2m-rsc : ' + status + ' <----');

                setTimeout(setup_resources, 100, 'rtvae');
            }
            else {
                console.log('[???} create container error!  ', status + ' <----');
                // setTimeout(setup_resources, 3000, 'crtae');
            }
        });
    }
    else if (_status === 'rtvae') {
        onem2m_client.retrieve_ae(conf.ae.parent + '/' + conf.ae.name, (status, res_body) => {
            if (status === 2000) {
                var aeid = res_body['m2m:ae']['aei'];
                console.log('x-m2m-rsc : ' + status + ' - ' + aeid + ' <----');

                if (conf.ae.id !== aeid && conf.ae.id !== ('/' + aeid)) {
                    console.log('AE-ID created is ' + aeid + ' not equal to device AE-ID is ' + conf.ae.id);
                }
                else {
                    request_count = 0;
                    setTimeout(setup_resources, 100, 'crtct');
                }
            }
            else {
                console.log('x-m2m-rsc : ' + status + ' <----');
                // setTimeout(setup_resources, 3000, 'rtvae');
            }
        });
    }
    else if (_status === 'crtct') {
        create_cnt_all(request_count, (status, count) => {
            if (status === 9999) {
                console.log('[???} create container error!');
                // setTimeout(setup_resources, 3000, 'crtct');
            }
            else {
                request_count = ++count;
                if (conf.cnt.length <= count) {
                    request_count = 0;
                    setTimeout(setup_resources, 100, 'delsub');
                }
            }
        });
    }
    else if (_status === 'delsub') {
        delete_sub_all(request_count, (status, count) => {
            if (status === 9999) {
                console.log('[???} create container error!');
                // setTimeout(setup_resources, 3000, 'delsub');
            }
            else {
                request_count = ++count;
                if (conf.sub.length <= count) {
                    request_count = 0;
                    setTimeout(setup_resources, 100, 'crtsub');
                }
            }
        });
    }
    else if (_status === 'crtsub') {
        create_sub_all(request_count, (status, count) => {
            if (status === 9999) {
                console.log('[???} create container error!');
                // setTimeout(setup_resources, 1000, 'crtsub');
            }
            else {
                request_count = ++count;
                if (conf.sub.length <= count) {
                    thyme_tas.ready_for_tas();

                    setTimeout(setup_resources, 100, 'crtci');
                }
            }
        });
    }
    else if (_status === 'crtci') {
    }
}

onem2m_client.on('notification', (source_uri, cinObj) => {

    // console.log(source_uri, cinObj);

    var path_arr = source_uri.split('/')
    var event_cnt_name = path_arr[path_arr.length - 2];
    var content = cinObj.con;

    /* ***** USER CODE ***** */
    if (event_cnt_name === 'led') {
        // send to tas
        thyme_tas.send_to_tas(event_cnt_name, content);
    }
    else if (path_arr[3] === 'Mission_Data') {
        if (conf.tas.client.connected) {
            path_arr.pop();
            let control_url = path_arr.join('/');
            conf.tas.client.publish(control_url, content, () => {
                console.log(control_url, content)
            });
            // TODO: content를 object로 전달받는 경우 추가
        }
    }
    /* */
});
