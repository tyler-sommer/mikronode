function encodeString(s, d) {
  let data = null;
  let len = Buffer.byteLength(s);
  let offset = 0;

  if(len < 0x80) {
    data = Buffer.alloc(len + 1);
    data[offset++] = len;
  } else if(len < 0x4000) {
    data = Buffer.alloc(len + 2);
    len |= 0x8000;
    data[offset++] = (len >> 8) & 0xff;
    data[offset++] = len & 0xff;
  } else if(len < 0x200000) {
    data = Buffer.alloc(len + 3);
    len |= 0xC00000;
    data[offset++] = (len >> 16) & 0xff;
    data[offset++] = (len >> 8) & 0xff;
    data[offset++] = len & 0xff;
  } else if(len < 0x10000000) {
    data = Buffer.alloc(len + 4);
    len |= 0xE0000000;
    data[offset++] = (len >> 24) & 0xff;
    data[offset++] = (len >> 16) & 0xff;
    data[offset++] = (len >> 8) & 0xff;
    data[offset++] = len & 0xff;
  } else {
    data = Buffer.alloc(len + 5);
    data[offset++] = 0xF0;
    data[offset++] = (len >> 24) & 0xff;
    data[offset++] = (len >> 16) & 0xff;
    data[offset++] = (len >> 8) & 0xff;
    data[offset++] = len & 0xff;
  }
  data.utf8Write(s, offset);
  d && console.log('Writing ', data);
  return data;
}

function decodePackets(data) {
  if (!data.length) return [];
  const result = [];
  let leftover;
  let idx = 0;
  let buf = [];
  // orig contains the original, encoded bytes of the record being decoded.
  // when a record is decoded and it is realized the record is incomplete,
  // the encoded orig will be returned as leftover to be decoded again when
  // more data is received in the next packet.
  let orig = Buffer.alloc(0);
  while (idx < data.length) {
    let rec_start = idx;
    let b = data[idx++];
    let len;
    if(b === 0x00) {
      // end of record, push what we have currently onto the result
      result.push(buf);
      // and clear the buffer for the next record
      buf = [];
      orig = Buffer.alloc(0);
      continue;
    }
    [len, idx] = decodeLength(data, idx, b);
    let end = idx + len;
    orig = Buffer.concat([orig, data.slice(rec_start, end)]);
    if(end > data.length) {
      // record is incomplete, set leftover and quit the loop
      leftover = orig;
      break;
    }
    buf.push(data.slice(idx, end).toString('utf8'));
    idx += len;
  }
  return [result, leftover];
}

function decodeLength(data, idx, b) {
  let len = b;
  switch (true) {
    case (b & 0x80) === 0x00:
      break;
    case (b & 0xC0) === 0x80:
      len &= ~0xC0;
      len = (len << 8) | data[idx++];
      break;
    case (b & 0xE0) === 0xC0:
      len &= (~0xE0);
      len = (len << 8) | data[idx++];
      len = (len << 8) | data[idx++];
      break;
    case (b & 0xF0) === 0xE0:
      len &= (~0xF0);
      len = (len << 8) | data[idx++];
      len = (len << 8) | data[idx++];
      len = (len << 8) | data[idx++];
      break;
    case (b & 0xF8) === 0xF0:
      len = data[idx++];
      len = (len << 8) | data[idx++];
      len = (len << 8) | data[idx++];
      len = (len << 8) | data[idx++];
      break;
    default:
      throw new Error(`unable to decode length (${b.toString('hex')})`);
  }
  return [len, idx];
}

function objToAPIParams(obj, type) {
  const prefix = type === 'print' ? '' : '=';
  return Object.keys(obj)
    .map(k => obj[k] ? `${prefix}${k}=${obj[k]}` : `${prefix}${k}`);
}

function resultsToObj(r) {
  if(r.type) {
    if(Array.isArray(r.data)) return resultsToObj(r.data);
    return [];
  }
  if(r.length && Array.isArray(r[0])) return r.map(resultsToObj);
  if(!Array.isArray(r)) return {};
  return r.reduce((p, f) => {
    p[f.field] = f.value;
    return p;
  }, {});
}

export {decodePackets, encodeString, objToAPIParams, resultsToObj};
