# Mikronode
      
Full-Featured asynchronous Mikrotik API interface for [NodeJS](http://nodejs.org).

```js 
import {MikroNode} from ('mikronode');

let device = new MikroNode('192.168.0.1');

device.connect().then(([login]) => {
  return login('username','password');
}).then(conn => {
  let chan = conn.openChannel("addresses"); // open a named channel
  let chan2 = conn.openChannel("firewall_connections",true); // open a named channel, turn on "closeOnDone"

  chan.write('/ip/address/print');

  chan.on('done', data => {
    // data is all of the sentences in an array.
    data.forEach(function(item) {
       console.log('Interface/IP: '+item.data.interface+"/"+item.data.address);
    });
    chan.close(); // close the channel. It is not autoclosed by default.
    conn.close(); // when closing connection, the socket is closed and program ends.
  });

  chan2.write('/ip/firewall/print');

  chan2.done.subscribe(data => {
    // data is all of the sentences in an array.
    data.forEach(function(item) {
      let data = MikroNode.resultsToObj(item.data); // convert array of field items to object.
      console.log('Interface/IP: '+data.interface+"/"+data.address);
    });
  });
});
```

### Contributing
Make sure to run `yarn prebuild` before committing if you've changed `src/parser.g` so that `/src/parser.js` reflects any changes.