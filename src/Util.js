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
  const buf = [];
  let leftover;
  let idx = 0;
  let bbuf = [];
loop:
  while (idx < data.length) {
    let b = data[idx++];
    let len = b;
    switch (true) {
      case b === 0x00:
        buf.push(bbuf);
        bbuf = [];
        continue loop;
      case (b & 0x80) === 0x00:
        break;
      case (b & 0xC0) === 0x80:
        len &= ~0xC0;
        len <<= 8;
        len += data[idx++];
        break;
      case (b & 0xE0) === 0xC0:
        len &= (~0xE0);
        len <<= 8;
        len += data[idx++];
        len <<= 8;
        len += data[idx++];
        break;
      case (b & 0xF0) === 0xE0:
        len &= (~0xF0);
        len <<= 8;
        len += data[idx++];
        len <<= 8;
        len += data[idx++];
        len <<= 8;
        len += data[idx++];
        break;
      case (b & 0xF8) === 0xF0:
        len = data[idx++];
        len <<= 8;
        len += data[idx++];
        len <<= 8;
        len += data[idx++];
        len <<= 8;
        len += data[idx++];
        break;
    }
    let end = idx + len;
    if(end > data.length) {
      // record is incomplete, set leftover and quit the loop
      leftover = data.slice(idx, end);
      idx += len;
      break;
    }
    bbuf.push(data.slice(idx, end).toString('utf8'));
    idx += len;
  }
  return [buf, leftover];
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
