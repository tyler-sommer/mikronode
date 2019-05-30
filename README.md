# Mikronode

[MikroTik](https://mikrotik.com/) API client for [NodeJS](http://nodejs.org).

This is a fork of the original [Mikronode](https://github.com/Trakkasure/mikronode)
that aims to modernize the codebase for ES2018 with no concern over backwards
compatibility.

```js 
import {MikroNode} from './src/index';

(async () => {
  try {
    let device = new MikroNode('192.168.88.1');
    let [login] = await device.connect();
    let conn = await login('admin', 'password');
    let chan = conn.openChannel('ip_example');
    chan.write('/ip/address/print');
    chan.on('done', result => {
      chan.close();
      conn.close();
      if (result.data) {
        let data = MikroNode.resultsToObj(result.data);
        Object.values(data).forEach(item => {
          console.log(`Interface: ${item.interface}\tIP:${item.address}`);
        });
      }
    });
  } catch (e) {
    console.error(e);
  }
})();
```

### Contributing
Make sure to run `yarn prebuild` before committing if you've changed `src/parser.g` so that `/src/parser.js` reflects any changes.