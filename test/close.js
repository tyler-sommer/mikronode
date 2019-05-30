// this tests that the connection is properly closed.
// This only verifies that all channels have been eliminated.
// A more full-featured test is in the works.

import {MikroNode} from '../src/index';

let device=new MikroNode('192.168.88.1');
device.setDebug(MikroNode.SILLY);

device.connect().then(([login]) => {
    return login('admin','password').then(c => runProgram(null, c));
});

function runProgram(err,c) {

    console.log('Connection established');

    const channel1 = c.openChannel(1);
    const channel2 = c.openChannel(2);
    const channel3 = c.openChannel(3);

    c.on('close',function(c2) {
        let id=channel1.getId();
        console.log("Channel closing...")
        try {
            c2.getChannel(id);
            console.log('Channel %s is still available. Error.',id);
        } catch (e) {
            console.log('Channel %s is gone!',id);
        }
        id=channel2.getId();
        try {
            c2.getChannel(id);
            console.log('Channel %s is still available. Error.',id);
        } catch (e) {
            console.log('Channel %s is gone!',id);
        }
        id=channel3.getId();
        try {
            c2.getChannel(id);
            console.log('Channel %s is still available. Error.',id);
        } catch (e) {
            console.log('Channel %s is gone!',id);
        }
    });
    channel1.write('/quit').catch(e=>{console.log("Error writing quit",e)})
}

