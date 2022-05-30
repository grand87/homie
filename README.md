# Mongoose OS Homie implementation

Provides JavaScript API support for [Homie 3.0.0](https://homieiot.github.io/specification/spec-core-v3_0_0/)

Implemented with Mongoose OS MQTT library

Homie device name defined as "device.id" from `mos.yml`

Supported 4 types of devices:

- HomieDevice.TYPE_INTEGER - for ex. volume level (read only)
- HomieDevice.TYPE_FLOAT   - for ex. temperature (read only)
- HomieDevice.TYPE_SWITCH  - for ex. relay (read/write)
- HomieDevice.TYPE_INPUT   - for ex. button (read only)


## Code example

Bellow code demonstrates registration single device of boolean type (read only)

```
// Device state
let globalState = {
    // Boolean value to be used as Homie device status
    inputStatus: false,
};

HomieDevice.init(); //will load nodes from the mos.yml file

// adding device with 2 states (true, false) as a readonly node
HomieDevice.addNode("input0", HomieDevice.TYPE_INPUT, function (nodeInfo) {
    return globalState.inputStatus;
});

// some handler of input change - updates value for Homie node state
let inputHandler = function (inputState) {
    globalState.inputStatus = inputState;
    
    // force update node state immidiatelly
    // if not called - will be updated according to "homie.updateInterval" seconds from config
    HomieDevice.update(true);
};
