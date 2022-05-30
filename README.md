# Mongoose OS Homie implementation

JavaScript API for Homie support

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
