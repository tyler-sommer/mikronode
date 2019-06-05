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

function decodePacket(data) {
  if(!data.length) return [];
  const buf = [];
  let idx = 0;
  while(idx < data.length) {
    let len;
    let b = data[idx++];
    switch(true) {
      case (b & 192) === 128:
        len = ((b & 63) << 8) + data[idx++];
        break;
      case (b & 224) === 192:
        len = ((b & 31) << 8) + data[idx++];
        len = (len << 8) + data[idx++];
        break;
      case (b & 240) === 224:
        len = ((b & 15) << 8) + data[idx++];
        len = (len << 8) + data[idx++];
        len = (len << 8) + data[idx++];
        break;
      case (b & 128) !== 0:
        len = data[idx++];
        len = (len << 8) + data[idx++];
        len = (len << 8) + data[idx++];
        len = (len << 8) + data[idx++];
        break;
      default:
        len = b;
    }
    // console.log("Pushing ",idx,len,data.slice(idx,idx+len));
    buf.push(data.slice(idx, idx + len).toString('utf8'));
    idx += len;
  }
  return buf;
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

export {decodePacket, encodeString, objToAPIParams, resultsToObj};
