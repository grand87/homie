/*
 * Copyright (c) Volodymyr "N0dGrand87" Sharaienko <grandamx@gmail.com>
 * All rights reserved
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

load('api_config.js');
load('api_mqtt.js');
load('api_log.js');
load('api_timer.js');

let HomieDevice = {

    _nodeCount: 0,
    _nodes: [],
    _topic: "homie/",
    _nodeStateTopicName: "state",

    init: function () {
        this._topic = 'homie/' + Cfg.get('device.id');

        let devCount = Cfg.get('homie.devices');
        this._nodeCount = 0;

        for (let i = 0; i < devCount; i++) {
            let configName = 'node' + JSON.stringify(i);
            let name = Cfg.get('homie.' + configName + '.name');
            let type = Cfg.get('homie.' + configName + '.type');
            this.addNode(name, type, null);
        }
    },

    addNode: function (nodeName, nodeType, getStateCallback) {
        // TODO: implement as function pointer table
        if (nodeType === 'integer') {
            return this.addNodeNumber(nodeName, getStateCallback);
        } else if (nodeType === 'float') {
            return this.addNodeFloat(nodeName, getStateCallback);
        } else if (nodeType === 'switch') {
            return this.addNodeSwitch(nodeName, getStateCallback);
        }

        Log.error("Node type is unsupport - " + nodeType);
        return null;
    },

    insertNodeInfo: function (nodeInfo) {
        this._nodes.splice(this._nodeCount, 0, nodeInfo);
        this._nodeCount++;
    },

    addNodeInteger: function (nodeName, getStateCallback) {
        let sensorInfo = {
            name: nodeName,
            isSetable: 'false',
            payload: 'integer',
            type: 'number',
            getState: getStateCallback
        };
        this.insertNodeInfo(sensorInfo);

        return sensorInfo;
    },

    addNodeFloat: function (nodeName, getStateCallback) {
        let sensorInfo = {
            name: nodeName,
            isSetable: 'false',
            payload: 'float',
            type: 'number',
            getState: getStateCallback
        };
        this.insertNodeInfo(sensorInfo);

        return sensorInfo;
    },

    addNodeSwitch: function (nodeName, getStateCallback) {
        let switchInfo = {
            name: nodeName,
            isSetable: 'true',
            payload: 'boolean',
            type: 'switch',
            getState: getStateCallback
        };
        this.insertNodeInfo(switchInfo);

        return switchInfo;
    },

    getNodeNames: function () {
        let result = 'system';
        for (let i = 0; i < this._nodeCount; i++) {
            result = result + ',' + this._nodes[i].name;
        }
        return result;
    },

    update: function (updateNodes) {
        this.updateStatus(updateNodes, Sys.uptime());
    },

    updateStatus: function (updateNodes, uptime) {
        let message = JSON.stringify(Math.round(uptime));
        Log.debug('Publishing to ' + this._topic + ':' + message);
        if(updateNodes === true) {
            for (let i = 0; i < this._nodeCount; i++) {
                this.updateNode(this._nodes[i]);
            }
        } else {
            this.sendMQTT('/$stats', 'uptime');
            this.sendMQTT('/$stats/uptime', message);
            this.sendMQTT('/system/uptime', message);
        }
    },

    sendNodeInfo: function (nodeInfo) {
        let nodeTopic = '/' + nodeInfo.name;

        this.sendMQTT(nodeTopic + '/$name', nodeInfo.name);
        this.sendMQTT(nodeTopic + '/$type', nodeInfo.type);
        this.sendMQTT(nodeTopic + '/$properties', this._nodeStateTopicName);

        let nodeStateTopic = nodeTopic + '/' + this._nodeStateTopicName;
        // TODO: fix the default value
        this.sendMQTT(nodeStateTopic, '0');


        this.sendMQTT(nodeStateTopic + '/$name', nodeInfo.name);
        this.sendMQTT(nodeStateTopic + '/$settable', nodeInfo.isSetable);
        this.sendMQTT(nodeStateTopic + '/$datatype', nodeInfo.payload);
        this.sendMQTT(nodeStateTopic + '/$retained ', 'true');

        if (nodeInfo.isSetable === 'true') {
            let topic = this._topic + nodeStateTopic + '/set';
            MQTT.sub(topic, mqttSubHandler, null);
        }
    },

    sendIntro: function () {
        Log.debug('sendIntro() start');
        this.sendMQTT('/$state', 'init');
        this.sendMQTT('/$homie', '3.0');
        this.sendMQTT('/$name', Cfg.get('device.id'));

        let nodeNames = this.getNodeNames();
        Log.debug('Adding nodes: ' + nodeNames);
        this.sendMQTT('/$nodes', nodeNames);
        this.sendMQTT('/$stats/interval', JSON.stringify(Cfg.get('homie.updateInterval') * 2));

        //register "system" node and its properties
        //TODO: refactor - define APIs to register node based on it's type (system\switch\sensor)
        this.sendMQTT('/system/$name', 'system');
        this.sendMQTT('/system/$type', 'MCU');
        this.sendMQTT('/system/$properties', 'uptime');
        this.sendMQTT('/system/uptime', '0');
        this.sendMQTT('/system/uptime/$name', 'system uptime');
        this.sendMQTT('/system/uptime/$datatype', 'float');

        for (let i = 0; i < this._nodeCount; i++) {
            Log.debug('SendNodeInfo for ' + this._nodes[i].name);
            this.sendNodeInfo(this._nodes[i]);
        }

        this.updateStatus(Sys.uptime());

        this.sendMQTT('/$state', 'ready');
        Log.debug('sendIntro() done');
    },

    sendMQTT: function (subTopic, msg) {
        MQTT.pub(this._topic + subTopic, msg, 1, true);
    },

    getNodeTopic: function (nodeInfo) {
        return '/' + nodeInfo.name + '/' + this._nodeStateTopicName;
    },

    updateNode: function (nodeInfo) {
        let propertyNewValue = null;
        if (nodeInfo.getState !== null) {
            propertyNewValue = JSON.stringify(nodeInfo.getState());
        } else if (this.stateUpdateListener !== null) {
            propertyNewValue = JSON.stringify((this.stateUpdateListener(nodeInfo)));
        } else {
            Log.debug('State update listener is not defined for node ' + nodeInfo.name);
        }

        if (propertyNewValue !== null) {
            Log.debug('updateNode(): ' + nodeInfo.name + ' - ' + propertyNewValue);
            let nodeTopic = this.getNodeTopic(nodeInfo);
            Log.debug('updateNode(): ' + nodeTopic);
            this.sendMQTT(nodeTopic, propertyNewValue);
        }
    },

    onDeviceStateChangeListener: null,

    setOnStateChangeListener: function (listener) {
        this.onDeviceStateChangeListener = listener;
    },

    stateUpdateListener: null,

    setStateUpdateListener: function (listener) {
        this.stateUpdateListener = listener;
    },

    extractDeviceName: function (topic) {
        // Extracts device name from topic
        // The string example is 'homie/<deviceId>/relay0/state/set'

        // Step 1:
        // this part in the topic will be the same "homie/<deviceId>"
        // we could precalculate this length and extract the string starting from this position
        // this value stored as this._topic

        // Step 2:
        // According to homie setup remaining part of message is <device>/state/set - see "this.sendMQTT('/relay0/$properties', 'state');"

        let startPos = this._topic.length + 1; // "homie/<deviceId>"
        let endPos = topic.length - this._nodeStateTopicName.length - 5; // -"/" -"state - "/" - "set"
        let deviceAndProperty = topic.slice(startPos, endPos);
        Log.info('getDeviceName() ' + deviceAndProperty);

        return deviceAndProperty;
    }
};

//init MQTT Events handler
MQTT.setEventHandler(function (conn, ev, edata) {
    if (ev === MQTT.EV_CONNACK) {
        HomieDevice.sendIntro();

        //TODO: add timer setup here
    }

    //TODO: if disconnected - kill timer
}, null);

let mqttSubHandler = function (conn, topic, msg) {
    Log.info('[mqttSubHandler] Topic: ' + topic + ' message: ' + msg);
    if (HomieDevice.onDeviceStateChangeListener !== null) {
        //TODO: replace with getNodeByTopic()
        let deviceName = HomieDevice.extractDeviceName(topic);
        HomieDevice.onDeviceStateChangeListener(deviceName, msg === 'true');
    }
};

let homieUpdateInterval = Cfg.get('homie.updateInterval') * 500; // in ms
let updateNodes = false;
Timer.set(homieUpdateInterval, Timer.REPEAT, function () {
    if (MQTT.isConnected()) {
        HomieDevice.update(updateNodes);
        updateNodes = updateNodes === false;
    }
}, null);
