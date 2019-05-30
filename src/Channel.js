import events from 'events';
import {Observable, Subject} from 'rxjs';
import {CHANNEL, DEBUG, EVENT} from './constants.js';

// console.log2=console.log;
// console.log=function(...args) {
//     const stack=new Error().stack.split('\n');
//     const file = (stack[2].match(/\(([^:]+:\d+)/)||['',''])[1].split("/").pop()+": "+typeof args[0]==="string"?args.shift():'';
//     console.log2(file,...args);
// }

export default class Channel extends events.EventEmitter {

  /**
   * Create new channel on a connection. This should not be called manually. Use Connection.openChannel
   * @constructor
   * @param {string|number} id ID of the channel
   * @param {object} stream stream object representing link to connection.
   * @param {number} debug The debug level.
   * @param {boolean} closeOnDone If the channel should close itself when the next done event occurs, and there are no more commands to run.
   */
  constructor(id, stream, debug, closeOnDone) {
    super();

    this.id = id;

    this._status = CHANNEL.OPEN;

    /** Current Debug level for this channel.
     * @private
     * @instance
     * @member {int} debug
     * @memberof Channel
     **/

    this.debug = DEBUG.NONE;

    /** If whether to call close on this channel when done event occurs, and there are no commands in the queue to run.
     * @private
     * @instance
     * @member {boolean} closeOnDone
     * @memberof Channel
     **/

    this._closeOnDone = true;

    /** If wether to call close on this channel when trap event occurs.
     * @private
     * @instance
     * @member {boolean} closeOnTrap
     * @memberof Channel
     **/

    this._closeOnTrap = false;

    /** The buffered stream. Used to hold all results until done or trap events occur.
     * @private
     * @instance
     * @member {Observable} bufferedStream
     * @memberof Channel
     **/

    this.bufferedStream = null;

    /** If commands should be synchronous.
     * @private
     * @instance
     * @member {boolean} sync
     * @memberof Channel
     **/

    this._sync = true;

    this.cmdCount = 0;

    this.cmd = {};

    this.debug = debug;
    this.debug & DEBUG.SILLY && console.log('Channel::New', [].slice.call(arguments));
    this._closeOnDone = (typeof closeOnDone === typeof true) ? closeOnDone : this._closeOnDone;
    this.id = id; // hold a copy.

    if(this.status & (CHANNEL.CLOSING | CHANNEL.CLOSED)) return; // catch bad status

    this._stream = stream; // Hold a copy
    // Stream for reading everything.
    this._read = stream.read.takeWhile(data => !(this.status & CHANNEL.CLOSED))
      .do(e => this.debug >= DEBUG.SILLY && console.log('Channel (%s)::%s Sentence on channel ', e.tag))
      .flatMap(data => {
        const cmd = this.getCommandId(data);
        const d = {
          ...data,
          tag: data.tag.substring(0, data.tag.lastIndexOf('-')),
          cmd: (this.getCommand(cmd) || {cmd: null}).cmd
        };
        if(d.type == EVENT.DONE_RET || d.type === EVENT.DONE_RET_TAG) {
          d.data = d.data;
          const d2 = {...d, type: EVENT.DATA};
          return Observable.of(d2).concat(Observable.of(d));
        }
        return Observable.of(d);
      }).share();

    // Stream for sentences with data.
    this._data = this.createStream(this._read, [EVENT.DATA, EVENT.DATA_RET, EVENT.DATA_RET_TAG]).share();

    // Stream for signaling when done.
    this._done = this.createStream(this._read, [EVENT.DONE, EVENT.DONE_RET, EVENT.DONE_TAG]).share();

    // Stream for all traps from device.
    this._trap = this._read
      .filter(e => e.type == EVENT.TRAP || e.type === EVENT.TRAP_TAG)
      .do(e => this.debug >= DEBUG.DEBUG && console.log('Channel (%s)::TRAP ', id))
      .share();

    this._read.filter(e => e.type == EVENT.FATAL)
      .subscribe(e => {
        this.debug >= DEBUG.DEBUG && console.log('Channel (%s)::FATAL ', id);
        this._status = CHANNEL.CLOSING;
        this.close();
      });

    this.bufferedStream = new Subject();
  }

  /** Data stream returns each sentence from the device as it is received. **/
  get data() {
    return this._data;
  }

  /** Done stream buffers every sentence and returns all sentences at once.
   Don't use this stream when "listen"ing to data. Done never comes on a watch/listen command.
   A trap signals the end of the data of a listen command.
   **/
  get done() {
    return this.bufferedStream;
  }

  /** When a trap occurs, the trap sentence flows through this stream **/
  get trap() {
    // TRAP_TAG is the only one that *should* make it here.
    return this._trap;
  }

  /** This is the raw stream. Everything for this channel comes through here. **/
  get stream() {
    return this._read;
  }

  /**
   * Get the current status of this channel.
   * @return The status code
   */
  get status() {
    return this._status;
  }

  /**
   *
   * @param {string} command The command to write to the device on this channel.
   * @param {*} args Arguments to pass as part of the command.
   */
  write(command, args = []) {
    if(this.status & (CHANNEL.CLOSED | CHANNEL.CLOSING)) {
      this.debug >= DEBUG.WARN && console.error('Cannot write on closed or closing channel');
      const p = new Promise((resolve, reject) => reject({
        tag: this.id,
        data: {message: 'Cannot write on closed or closing channel'},
        cmd: {command, args}
      }));
      // p.catch(e=>{console.error(e.data.message)});
      return p;
    }
    if(command === '/cancel') {
      Object.keys(this.cmd).forEach(id => {
        this._stream.write(command, args, id);
      });
      return Promise.resolve({tag: this.id, data: {message: '/cancel sent.'}});
    }

    return new Promise((resolve, reject) => {
      // Add the command to the registry.
      const cmd = this.registerCommand(command, args, resolve, reject);
      const commandId = cmd.id;

      if((Object.keys(this.cmd).length - 1) === 0 && !(this._sync && this.status & CHANNEL.RUNNING)) {
        // console.log("There are no commands in the buffer, but channel is in running state while sync enabled.");
        this._status = CHANNEL.RUNNING;
        this.debug >= DEBUG.INFO && console.log('Writing on channel %s', this.id, command, args);
        this._stream.write(command, args, commandId);
      } else {
        const last = this.lastCommand(commandId);
        // If we are in sync mode, wait until the command is complete
        if(this._sync) last.promise.then(() => {
          this._status = CHANNEL.RUNNING;
          this._stream.write(command, args, commandId);
        }).catch(() => {
          this._stream.write(command, args, commandId);
        });
        // Otherwise since the last command was sent, we can send this one now.
        else {
          this._status = CHANNEL.RUNNING;
          this._stream.write(command, args, commandId);
        }
      }
    });
  }

  /**
   * Clear the command from cache
   * @param {number} commandId
   */

  clearCommand(commandId) {
    if(typeof commandId === typeof {}) {
      if(commandId.cmd)
        return this.clearCommand(commandId.cmd.id);
      if(commandId.id)
        return this.clearCommand(commandId.id);
      return null;
    }
    this.debug >= DEBUG.DEBUG && console.log('Clearing command cache for #', commandId);
    const cmd = this.cmd[commandId];
    if(!cmd) return;
    delete cmd.resolve;
    delete cmd.reject;
    delete this.cmd[commandId];
    if(!Object.keys(this.cmd).length) {
      if(this._closeOnDone) this.close();
    }
  }

  /**
   * Get the last command relative to the commandId
   * @param {number} commandId
   */

  lastCommand(commandId) {
    return this.cmd[commandId - 1];
  }

  getCommand(commandId) {
    if(!commandId) return null;
    if(typeof commandId === typeof {}) {
      if(commandId.cmd) return commandId.cmd;
      return null;
    }
    return this.cmd[commandId];
  }

  /**
   *
   * @param {string} command Command to send to device
   * @param {array} args Arguments for command
   * @param {object} promise object containing resolve and reject functions.
   */

  registerCommand(command, args, resolve, reject) {
    this.cmdCount = this.cmdCount + 1;
    const commandId = this.cmdCount;
    this.cmd[commandId] = {id: commandId, cmd: {id: commandId, command, args}, resolve, reject};
    (function (id, resolve, reject) {
      const race = Observable.race(
        this._done
          .filter(
            data => data.cmd && data.cmd.id === id
          )
          // .do(
          //     d=>console.log("*** Done in %s:%s",d.cmd.id,id)
          // )
          .take(1)
        , this._trap
          .filter(
            data => data.cmd && data.cmd.id === id
          )
          // .do(
          //     d=>console.log("*** Trap in %s:%s",d.cmd.id,id)
          // )
          .take(1)
      ).take(1);

      race.partition(data => data.type == EVENT.TRAP || data.type === EVENT.TRAP_TAG)
        .reduce((r, o, i) => {
          if(i == 0) {
            o.subscribe(error => {
              this.debug >= DEBUG.DEBUG && console.error('*** Register Command: trap', id, error);
              this._status = CHANNEL.DONE;
              if(this._closeOnTrap) {
                this._status = CHANNEL.CLOSING;
                this.debug >= DEBUG.DEBUG && console.log('Channel (%s):: read-done catch CLOSING', this.id);
                this.close(true);
              }
              reject(error);
              this.emit('trap', error);
            }, null);
          } else return o;
        }, {});

      const isListen = command.split('/').indexOf('listen') > 0;
      this._data
        .filter(data => data.cmd.id === id)
        .takeUntil(race)
        .do(d => this.debug >= DEBUG.SILLY && console.log('*** Data in %s:%s', d.cmd.id, id))
        .reduce((acc, d) => {
          if(d.data && !isListen) acc.data = acc.data.concat([d.data]);
          return acc;
        }, {cmd: this.cmd[id].cmd, tag: this.id, data: []})
        .do(d => this.debug >= DEBUG.SILLY && console.log('*** Reduced Data in ', d))
        .takeUntil(race.filter(data => data.type == EVENT.TRAP || data.type === EVENT.TRAP_TAG))
        .subscribe(data => {
          this.debug >= DEBUG.SILLY && console.log('*** Register Command: subscribe', id, data);
          this._status = CHANNEL.DONE;
          this.bufferedStream.next(data);
          resolve(data);
          this.emit('done', data);
        },
        error => {
          this.debug >= DEBUG.SILLY && console.error('*** Register Command: error', id, error);
        },
        // this should happen for every command
        () => {
          this.debug >= DEBUG.SILLY && console.log('*** Register Command: complete', commandId);
          setTimeout(() => this.clearCommand(id), 50); // make sure all promises complete before running this.
        });
    }.bind(this))(commandId, resolve, reject);
    return this.cmd[commandId].cmd;
  }

  /**
   * Create a stream filtered by list of event types.
   * @param {Observable} stream The stream representing the incoming data
   * @param {Array} events list of events to filter by
   * @return {Observable} The incoming stream filtered to only the packets having data.
   */
  createStream(stream, events) {
    return this._read
      .filter(e => events.indexOf(e.type) != -1)
      .do(e => this.debug >= DEBUG.DEBUG && console.log('Channel (%s)::%s flatMap', e.tag, e.type))
      .flatMap(d => {
        return Observable.of(d);
        // this.dataBuffer[d.cmd.id].push(d.data);
      });
  }

  /**
   *
   * @param {Object} data Sentence object from read stream
   * @return {String} Command ID of sentence.
   */
  getCommandId(data) {
    if(!data) return null;
    if(typeof data === typeof {})
      return this.getCommandId(data.tag);
    return data.substring(data.lastIndexOf('-') + 1);
  }

  // status() { return this.status }
  close(force) {
    if(this.status & CHANNEL.RUNNING) {
      if(force)
        Object.keys(this.cmd).forEach(id => {
          this._stream.write('/cancel', [], id);
        });
      this._closeOnDone = true;
      this._sync = true;
      this._status = CHANNEL.CLOSING;
      return;
    }
    if(this.status & CHANNEL.CLOSED) return;
    this._status = CHANNEL.CLOSED;
    this.debug >= DEBUG.INFO && console.log('Channel (%s)::CLOSED', this.id);
    this.bufferedStream.complete();
    this._stream.close();
    this.removeAllListeners(EVENT.DONE);
    this.removeAllListeners(EVENT.DATA);
    this.removeAllListeners(EVENT.TRAP);
  }

  /**
   * Commands are sent to the device in a synchronous manor. This is enabled by default.
   * @param {sync} sync If passed, this sets the value of sync.
   * @return If sync parameter is not passed, the value of sync is returned. Otherwise this channel object is returned.
   */
  sync(...args) {
    if(args.length) {
      this._sync = !!args[0];
      return this;
    }
    return this._sync;
  }

  /**
   *
   * @param {Observable} stream Take incoming commands to write to this channel from the provided stream. The channel will stop taking commands if a fatal error occurs, or if the channel is closing or closed.
   *
   */
  pipeFrom(stream) {
    if(this.status & (CHANNEL.DONE | CHANNEL.OPEN)) {
      this._status = CHANNEL.RUNNING;
      stream.takeWhile(o => !(this.status & (CHANNEL.FATAL | CHANNEL.CLOSING | CHANNEL.CLOSED))).subscribe(
        d => this.write(d),
        () => {
          this._status = CHANNEL.DONE;
          this._stream.close();
        },
        () => {
          this._status = CHANNEL.DONE;
          this._stream.close();
        }
      );
    }
  }

  getId() {
    return this.id;
  }

  on(event, func) {
    const ret = super.on(event, func);
    this.setupEventSubscription(event, this.getStreamByEventType(event));
    return ret;
  }

  addEventListener(event, func) {
    const ret = super.addEventListener(event, func);
    this.setupEventSubscription(event, this.getStreamByEventType(event));
    return ret;
  }

  once(event, func) {
    const ret = super.once(event, func);
    this.setupEventSubscription(event, this.getStreamByEventType(event));
    return ret;
  }

  /**
   * @param {String} event The event name to map to an observable stream.
   * @return Observable stream.
   */

  getStreamByEventType(event) {
    switch (event) {
    case EVENT.DONE:
      return this.bufferedStream;
    case EVENT.TRAP:
      return this.trap;
    case EVENT.FATAL:
      return this.fatal;
    default:
      return this._read;
    }
  }

  /**
   * @param {String} event The name of the event to setup for emitting.
   * @param {Observable} stream The stream to listen for events.
   * @return {Observable} Stream that will send out a copy of its input as long as there are event callbacks for the event requested.
   */

  setupEventSubscription(event, stream) {
    if(this.listeners(event)) return;
    // take from the stream until there are no more event listeners for that event.
    const listenerStream = stream.takeWhile(o => !this.listeners(event));
    listenerStream.subscribe(e => {
      this.emit(event, e);
    });
    return listenerStream;
  }

  /** When the done sentence arrives, close the channel. This only works in synchronous mode. **/
  closeOnDone(...args) {
    if(args.length)
      this._closeOnDone = !!args[0];
    else this._closeOnDone;
    return this;
  }

  /** If trap occurs, consider it closed. **/
  closeOnTrap(...args) {
    if(args.length)
      this._closeOnTrap = !!args[0];
    else return this._closeOnTrap;
    return this;
  }

}
