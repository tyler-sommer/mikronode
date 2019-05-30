import events from 'events';
import {CHANNEL, CONNECTION, DEBUG, EVENT, STRING_TYPE} from './constants.js';
import Channel from './Channel';

export default class Connection extends events.EventEmitter {
  constructor(stream, loginHandler, p) {
    super();
    this.status = CONNECTION.NONE;
    this.channels = [];
    this._debug = DEBUG.NONE;
    this._closeOnDone = false;
    this.stream = stream;

    const login = stream.read
      // .do(d=>console.log("Sentence: ",d))
      .takeWhile(o => this.status !== CONNECTION.CONNECTED).share();

    const rejectAndClose = d => {
      p.reject(d);
      this.close();
    };

    login.filter(d => d.type === EVENT.TRAP)
      .do(t => {
        this.emit('trap', t.data);
        this._debug && console.log('Trap during login: ', t.data);
      }).map(t => t.data)
      .subscribe(rejectAndClose, rejectAndClose);

    login.filter(d => d.type === EVENT.DONE_RET)
      .subscribe(data => {
        this.status = CONNECTION.CONNECTING;
        this._debug >= DEBUG.DEBUG && console.log('Got done_ret, building response to ', data);
        let a = data.data.split('');
        let challenge = [];
        while(a.length) challenge.push(parseInt('0x' + a.shift() + a.shift()));
        this._debug >= DEBUG.DEBUG && console.log('Challenge length:' + challenge.length);
        if(challenge.length != 16) {
          this.status = CONNECTION.ERROR;
          this._debug >= DEBUG.WARN && console.log(this.status);
          stream.sentence.error('Bad Connection Response: ' + data);
        } else {
          loginHandler(challenge);
        }
      });

    login.filter(d => d.type === EVENT.DONE)
      .subscribe(d => {
        this.status = CONNECTION.CONNECTED;
        this._debug >= DEBUG.INFO && console.log('Login complete: Connected');
        p.resolve(this);
      },
      rejectAndClose,
      () => {
        this._debug >= DEBUG.DEBUG && console.log('Login stream complete');
      }
      );

    stream.read
      .subscribe(null, null, e => {
        this.channels.forEach(c => c.close(true));
        setTimeout(() => {
          this.emit('close', this);
        }, 50);
      });
  }

  get connected() {
    return !!(this.status & (CONNECTION.CONNECTED | CONNECTION.WAITING | CONNECTION.CLOSING));
  }

  close() {
    this._debug >= DEBUG.SILLY && console.log('Closing connection through stream');
    this.emit('close', this);
    this.stream.close();
  }

  /*
   * @deprecated use debug(level)
   */
  setDebug(d) {
    this._debug = d;
    return this;
  }

  debug(...args) {
    if(args.length)
      this._debug = args[0];
    else return this._debug;
    return this;
  }

  /** If all channels are closed, close this connection */
  closeOnDone(...args) {
    if(args.length)
      this._closeOnDone = !!args[0];
    else return this._closeOnDone;
    return this;
  }

  getChannel(id) {
    return this.channels.filter(c => c.getId() == id)[0];
  }

  openChannel(id, closeOnDone) {
    this._debug >= DEBUG.SILLY && console.log('Connection::OpenChannel');
    if(!id) {
      id = +(new Date());
    } else {
      if(this.channels.some(c => c.getId() === id)) throw ('Channel already exists for ID ' + id);
    }
    this._debug >= DEBUG.SILLY && console.log('Creating proxy stream');
    const matchId = RegExp('^' + id + '-');
    let s = {
      'read': this.stream.read
        .filter(e => matchId.test(e.tag)),
      'write': (d, args, cmdTrack = 0) => {
        if(typeof (d) === STRING_TYPE)
          d = d.split('\n');
        if(Array.isArray(d) && d.length) {
          d.push(`.tag=${id}-${cmdTrack}`);
          return this.stream.write(d, args);
        }
      },
      'close': () => {
        let channel = this.getChannel(id);
        if(channel) {
          this._debug >= DEBUG.DEBUG && console.log('Closing channel ', id);
          setTimeout(channel.emit.bind(channel, 'close', channel), 50);
          this.channels.splice(this.channels.indexOf(channel), 1);
          if(this.channels.filter(c => c.status & (CHANNEL.OPEN | CHANNEL.RUNNING)).length === 0 && this._closeOnDone) this.close();
        } else
          this._debug >= DEBUG.WARN && console.log('Could not find channel %s when trying to close', id);
      },
      'done': () => {
        // If Connection closeOnDone, then check if all channels are done.
        if(this._closeOnDone) {
          const cl = this.channels.filter(c => c.status & (CHANNEL.OPEN | CHANNEL.RUNNING));
          if(cl.length) return false;
          this._debug >= DEBUG.DEBUG && console.log('Channel done (%s)', id);
          this.channels.filter(c => c.status & (CHANNEL.DONE)).forEach(c => console.log('Closing...', c));
          return true;
        }
        return false;
      }
    };
    let c;
    this._debug >= DEBUG.INFO && console.log('Creating channel ', id);
    this.channels.push((c = new Channel(id, s, this._debug, closeOnDone)));
    this._debug >= DEBUG.INFO && console.log('Channel %s Created', id);
    return c;
  }
}
