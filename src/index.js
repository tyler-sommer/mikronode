import net from 'net';
import TLS from 'tls';
import {Observable, Subject} from 'rxjs';
import crypto from 'crypto';
import dns from 'dns';

import {decodePackets, encodeString, objToAPIParams, resultsToObj} from './Util.js';
import {CHANNEL, CONNECTION, DEBUG, EVENT, STRING_TYPE, AUTH_MODE} from './constants.js';
import parser from './parser.js';

import Connection from './Connection';

const Socket = net.Socket;

const nullString = String.fromCharCode(0);

export class MikroNode {
  /**
   * Creates a MikroNode API object.
   * @exports mikronode
   * @function
   * @static
   * @param {string} host - The host name or ip address
   * @param {number} [port=8728] - Sets the port if not the standard 8728 (8729 for
   *           TLS).
   * @param {number} [timeout=0] - Sets the socket inactivity timeout. A timeout
   *           does not necessarily mean that an error has occurred, especially if you're
   *           only listening for events.
   * @param {(object|boolean)} [options.tls] - Set to true to use TLS for this connection.
   *           Set to an object to use TLS and pass the object to tls.connect as the tls
   *           options. If your device uses self-signed certificates, you'll either have to
   *           set 'rejectUnauthorized : false' or supply the proper CA certificate. See the
   *           options for
   *           {@link https://nodejs.org/api/tls.html#tls_tls_connect_port_host_options_callback|tls.connect()}
   *           for more info.
   * @throws <strong>WARNING: If you do not listen for 'error' or 'timeout' events and one
   *            occurrs during the initial connection (host unreachable, connection refused,
   *            etc.), an "Unhandled 'error' event" exception will be thrown.</strong>
   */
  constructor(host, port = 8728, timeout = 5) {
    // const {debug,port,timeout}=opts;
    this.host = host;
    this.port = port;
    this.timeout = timeout;

    this.debug = DEBUG.NONE;

    this.sock = null;

    this.status = CONNECTION.DISCONNECTED;
    this.authMode = AUTH_MODE.DEFAULT;

    this.tls = null;

    this._socketOpts = {};
  }

  get socketOpts() {
    return this._socketOpts;
  }

  set socketOpts(opts) {
    this._socketOpts = opts;
    if(opts.host) this.host = opts.host;
    if(opts.port) this.port = opts.port;
  }

  /** Change debug level **/
  setDebug(debug) {
    this.debug = debug;
    if(this.sock) this.sock.setDebug(debug);
    if(this.connection) this.connection.setDebug(debug);
  }

  /** Change the port */
  setPort(port) {
    this.port = port;
  }

  /** get/set tls options for this connection */
  TLS(opts = {}) {
    if(opts) {
      this.tls = opts;
      if(opts.host) this.host = opts.host;
      if(opts.port) this.port = opts.port;
      return this;
    }
    return this.tls;
  }

  /** Set timeout for socket connecion */
  setTimeout(timeout) {
    this.timeout = timeout;
    this.sock.setTimeout(timeout);
  }

  /** Connect to remote server using ID and password */
  connect(arg1, arg2) {
    this.debug >= DEBUG.INFO && console.log('Connecting to ' + this.host);

    let cb;
    this.debug >= DEBUG.SILLY && console.log('Creating socket');
    this.sock = new SocketStream(this.timeout, this.debug, this.tls ? typeof this.tls === typeof {} ? this.tls : {} : false);
    const stream = this.sock.getStream();

    if(typeof arg1 === typeof {}) {
      this.socketOpts = {...this.socketOpts, arg1};
      if(typeof arg1 === typeof function () {
      })
        cb = arg2;
    } else if(typeof arg1 === typeof function () {
    }) cb = arg1;

    const close = () => this.sock.getStream().sentence.complete();

    const login = (user, password) => {
      return new Promise((resolve, reject) => {
        this.debug >= DEBUG.DEBUG && console.log('Logging in');
        if(this.authMode === AUTH_MODE.PRE_6_43) {
          // Support pre-6.43 authentication
          // see: https://wiki.mikrotik.com/wiki/Manual:API#Initial_login
          stream.write(['/login']);
        } else {
          stream.write(['/login', `=name=${user}`, `=password=${password}`]);
        }
        // Create a connection handler
        this.connection = new Connection(
          {...stream, close},
          challenge => {
            // handler for supporting challenge during pre-6.43 authentication
            const md5 = crypto.createHash('md5');
            md5.update(Buffer.concat([Buffer.from(nullString + password), Buffer.from(challenge)]));
            stream.write([
              '/login',
              '=name=' + user,
              '=response=00' + md5.digest('hex')
            ]);
          }, {resolve, reject}
        );
        this.connection.setDebug(this.debug);
      });
    };

    this.debug >= DEBUG.SILLY && console.log('Creating promise for socket connect');
    const promise = new Promise((resolve, reject) => {
      this.debug >= DEBUG.SILLY && console.log('Connecting to remote host. Detected %s', net.isIPv6(this.host) ? 'ipv6' : net.isIPv4(this.host) ? 'ipv4' : 'DNS lookup');
      const fn = ((net.isIPv4(this.host) || net.isIPv6(this.host)) ? ((this.socketOpts.family = net.isIPv6(this.host) ? 6 : 4), (a, b) => b(null, [a])) : ((this.socketOpts.family == 6) ? dns.resolve4 : dns.resolve6));

      fn(this.host, (err, data) => {
        if(err) {
          return reject('Host resolve error: ', err);
        }
        // this.debug>=DEBUG.DEBUG&&console.log('Socket connect: ',{...this.socketOpts,...this.tls,host:this.host,port:this.port});
        this.sock.connect({
          ...this.socketOpts,
          ...this.tls,
          host: data[0],
          port: this.port
        }).then(([socketOpts, ...args]) => {
          this.debug >= DEBUG.DEBUG && console.log('Connected. Waiting for login.');
          // initiate the login process
          resolve([login, socketOpts, ...args]);
          if(cb) cb(null, login, socketOpts, ...args);
          /* Initiate Login */
          this.sock.getStream().sentence.take(1).subscribe(null, reject, null);
        }).catch(err => {
          if(cb) cb(err, null);
          reject(err);
        });
        // reject connect promise if the socket throws an error.
      });
    });
    // Connect to the server.
    return promise;
  }
}

// Object.keys(DEBUG).forEach(k=>MikroNode[k]=DEBUG[k]);
const api = Object.assign(MikroNode, DEBUG);
export default Object.assign(api, {CONNECTION, CHANNEL, EVENT, AUTH_MODE, resultsToObj});

/** Handles the socket connection and parsing of infcoming data. */

/* This entire class is private (not exported) */
class SocketStream {
  constructor(timeout, debug, tls) {
    debug >= DEBUG.DEBUG && console.log('SocketStream::new', [timeout, debug]);

    this.status = CONNECTION.NONE;
    this.debug = debug;
    this.rawSocket = new Socket();

    this.socket = tls ? new TLS.TLSSocket(this.rawSocket, tls) : this.rawSocket;

    this.sentence$ = new Subject();
    // Each raw sentence from the stream passes through this parser.
    this.parsed$ = this.sentence$
      .do(d => this.debug >= DEBUG.SILLY && console.log('Data to parse:', JSON.stringify(d)))
      .map(o => o.map(x => x.split('\r').join('\\r').split('\n').join('\\n')).join('\n')) // Make array string.
      .map(d => {
        let s = parser.parse(d);
        s.host = this.host;
        return s;
      })
      .filter(e => !!e)
      .flatMap(d => {
        Object.keys(d).forEach(k => {
          if(typeof d[k] === 'string') d[k] = d[k].split('\\r').join('\r').split('\\n').join('\n');
        });
        return Observable.from(d);
      }) // break off observable from parse stream.
      .share(); // parse the string.

    // When we receive data, it is pushed into the stream defined below.
    this.data$ = Observable.fromEvent(this.socket, 'data');
    // this is the stream reader/parser.
    // My poor stream parser
    this.data$.scan((/* @type Buffer */ last,/* @type Buffer */stream, i) => {
      let buff = Buffer.concat([last, stream]), end = 0, idx = 0, packet;
      this.debug >= DEBUG.DEBUG && console.log('Packet received: ', Buffer.from(stream).toString('base64'));
      this.debug >= DEBUG.DEBUG && last.length > 0 && console.log('Starting parse loop w/existing packet ', Buffer.from(last).toString('base64'));
      let [packets, leftover] = decodePackets(buff);
      for(packet of packets) {
        this.sentence$.next(packet);
      }
      return leftover;
    }, Buffer.from([]))
      .subscribe(e => this.debug >= DEBUG.DEBUG && e.length && console.log('Buffer leftover: ', Buffer.from(e).toString('base64')), this.closeSocket.bind(this), this.closeSocket.bind(this));


    this.socket.on('end', a => {
      this.debug >= DEBUG.INFO && console.log('Connection end ' + a);
      if(this.status === CONNECTION.CONNECTED) {
        // Completing the sentence closes all downstream observables and completes any subscriptions.
        this.sentence$.complete();
        // this.handler.close(true);
      }
    });

    this.socket.on('error', a => {
      this.debug >= DEBUG.ERROR && console.log('Connection error: ' + a);
      // Erroring the sentence closes all downstream observables and issues error any subscriptions.
      this.sentence$.error(a);
    });

    this.setTimeout(timeout);

    // This will be called if there is no activity to the server.
    // If this occurs before the login is successful, it could be
    // that it is a connection timeout.
    this.socket.setKeepAlive(true);
    this.b = [];
    this.len = 0;
    this.line = '';

  }

  // This is the function handler for error or complete for the parsing functions.
  closeSocket(e) {
    this.debug >= DEBUG.DEBUG && console.log('Closing Socket ', e);
    e ? this.rawSocket.destroy(e) : this.rawSocket.destroy();
  }

  setDebug(d) {
    this.debug >= DEBUG.DEBUG && console.log('SocketStream::setDebug', [d]);
    this.debug = d;
  }

  setTimeout(timeout) {
    this.debug >= DEBUG.DEBUG && console.log('SocketStream::setTimeout', [timeout]);
    this.socket.setTimeout(timeout * 1000, e => { // the socket timed out. According to the NodeJS api docs, right after this, it will be._closed.
      if(this.status !== CONNECTION.CONNECTED) {
        this.debug && console.log('Socket Timeout');
        this.sentence$.error('Timeout: ', JSON.stringify(e));
        // self.emit('error','Timeout Connecting to host',self);
      }
    });
  }

  /** Connect the socket */
  connect(socketOpts) {
    this.debug >= DEBUG.DEBUG && console.log('SocketStream::Connect %s', this.tls ? '(TLS)' : '', socketOpts);
    this.status = CONNECTION.CONNECTING;
    this.host = socketOpts.host || 'localhost';
    return new Promise((res, rej) => {
      /** Listen for complete on stream to dictate if socket will close */
      this.sentence$
        // .do(d=>console.log("Sentence: ",d))
        .subscribe(null, (e) => {
          rej(e);
          this.closeSocket();
        }, this.closeSocket.bind(this));
      // Connect to the socket. This works for both TLS and non TLS sockets.
      try {
        this.rawSocket.connect(socketOpts, (...args) => {
          this.debug >= DEBUG.INFO && console.log('SocketStream::Connected ', args, socketOpts);
          this.status = CONNECTION.CONNECTED;
          socketOpts = {
            ...socketOpts,
            localAddress: this.socket.localAddress,
            localPort: this.socket.localPort
          };
          if(this.socket.encrypted)
            res([{
              ...socketOpts,
              authorized: this.socket.authorized,
              authorizationError: this.socket.authorizationError,
              protocol: this.socket.getProtocol(),
              alpnProtocol: this.socket.alpnProtocol,
              npnProtocol: this.socket.npnProtocol,
              cipher: this.socket.getCipher(),
              cert: this.socket.getPeerCertificate(),
            }, ...args]);
          else res([socketOpts, ...args]);
        });
      } catch (e) {
        this.debug >= DEBUG.DEBUG && console.error('Caught exception while opening socket: ', e);
        rej(e);
      }
    });
  }

  /** Provides access to all of the different stages of input streams and the write stream. */
  getStream() {
    return {sentence: this.sentence$, write: this.write.bind(this), read: this.parsed$, raw: this.data$};
  }

  write(data, args) {
    if(args && typeof (args) === typeof ({})) {
      this.debug >= DEBUG.SILLY && console.log('Converting obj to args', args);
      data = data.concat(Array.isArray(args) ? args : objToAPIParams(args, data[0].split('/').pop()));
    }
    this.debug >= DEBUG.DEBUG && console.log('SocketStream::write:', [data]);
    if(!this.socket || !(this.status & (CONNECTION.CONNECTED | CONNECTION.CONNECTING))) {
      this.debug > DEBUG.WARN && console.log('write: not connected ');
      return;
    }
    if(typeof (data) === STRING_TYPE) data = [data];
    else if(!Array.isArray(data)) return;
    data.forEach(i => {
      try {
        this.debug >= DEBUG.DEBUG && console.log('SocketStream::write: sending ' + i);
        this.socket.write(encodeString(i, this.debug & DEBUG.SILLY));
      } catch (error) {
        this.sentence$.error(error);
      }
    });
    this.socket.write(nullString);
  }
}

