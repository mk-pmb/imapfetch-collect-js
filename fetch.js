/*jslint indent: 2, maxlen: 80, continue: false, unparam: false, node: true */
/* -*- tab-width: 2 -*- */
'use strict';

var EX, posInf = Number.POSITIVE_INFINITY,
  parseHeader = require('imap').parseHeader,
  transkey = require('transkey'),
  camelCase = transkey.dash2camel,
  headerEol = '\r\n',   // https://github.com/mscdex/node-imap/issues/621
  quotedPrintable = require('quoted-printable'),
  base64decode = require('atob'),   // browser compat
  collectStream = require('collect-stream');

function ifFun(x, d) { return ((typeof x) === 'function' ? x : d); }
function falseOrOr(x, d) { return (x === false ? x : (x || d)); }
function oes(o, k) { return ((o || false)[k] || ''); }

function makeGetBuf(buf) { return function getRawBuffer() { return buf; }; }

function getRawBufferWithOptionalDecode(bufs, n, enc, limit) {
  if (n !== +n) { return bufs; }
  n = (bufs[n] || false);
  if (!n) { return n; }
  if (enc === null) { enc = 'buffer'; }
  if (!enc) { return n; }
  n = n.getRawBuffer();
  if (enc === 'buffer') { return n; }
  if ((limit !== true) && (n.length > limit)) { n = n.slice(0, limit); }
  return n.toString(enc);
}

function makeRawBufferListGetter(bufs, defaultMaxBytes) {
  var g = getRawBufferWithOptionalDecode;
  return function getRawBuffer(n, enc, maxBytes) {
    return g(bufs, n, enc, (maxBytes || defaultMaxBytes));
  };
}


EX = function imapFetchCollect(fetcher, opts, whenFetched) {
  if (!ifFun(whenFetched)) {
    if (ifFun(opts)) {
      whenFetched = opts;
      opts = false;
    }
  }
  var msgs = [], whyFailed = null, dfOpt = EX.defaultOpts,
    maxDecodeBytes = (opts.maxDecodeBytes || dfOpt.maxDecodeBytes),
    prettifyMsg = EX.makeMessagePrettifier(opts);

  msgs.byUID = {};
  function addMsgByUID(msg) {
    var uid = msg.uid;
    if (uid === +uid) { msgs.byUID[uid] = msg; }
  }

  function fail(why) {
    if (whyFailed) { return; }
    whyFailed = why;
  }
  fetcher.on('error', fail);

  function recvMsg(reader, seqno) {
    if (whyFailed) { return; }
    var rawHeaders = [], rawBodies = [], msg = { seqno: seqno,
      headers: false,
      getRawHeaders:  makeRawBufferListGetter(rawHeaders, maxDecodeBytes),
      getRawBodies:   makeRawBufferListGetter(rawBodies, maxDecodeBytes),
      };

    function updAttr(attr) {
      Object.assign(msg, attr);
    }
    reader.on('attributes', updAttr);

    function startRecvBody(bodyStream, meta) {
      if (whyFailed) { return; }
      function saveRecvdBody(err, buf) {
        if (whyFailed) { return; }
        if (err) { fail(err); }
        var bodyInfo = meta, isHeader = (meta.which === 'HEADER');
        bodyInfo.getRawBuffer = makeGetBuf(buf);
        (isHeader ? rawHeaders : rawBodies).push(bodyInfo);
      }
      collectStream(bodyStream, saveRecvdBody);
    }
    reader.on('body', startRecvBody);

    function finishMsg() {
      prettifyMsg(msg);
      msgs.push(msg);
      addMsgByUID(msg);
    }
    reader.on('end', finishMsg);
  }
  fetcher.on('message', recvMsg);

  fetcher.on('end', function fetcherDone() {
    whenFetched(whyFailed, msgs);
  });
};


EX.defaultOpts = {
  maxDecodeBytes: 16 * Math.pow(1024, 2),
};


EX.parseCombinedHeaders = function (rawHeaders) {
  rawHeaders = rawHeaders.map(function (h) {
    return (h.text || h.getRawBuffer().toString('UTF-8'));
  }).join('\n').replace(/\r*\n[\r\n]*/g, headerEol);
  return parseHeader(rawHeaders);
};


EX.makeMessagePrettifier = function (opts) {
  var transkeyHdr = opts.translateHeaderNames;

  function prettifyMsg(msg) {
    var hdr = EX.parseCombinedHeaders(msg.getRawHeaders()),
      tx = msg.getRawBodies(0, 'UTF-8');

    if (tx) {
      (function decodeTE() {
        var enc = oes(hdr['content-transfer-encoding'], 0),
          decoName = 'decodeTE_' + camelCase(enc),
          decoFunc = ifFun(falseOrOr(opts[decoName], EX[decoName]));
        tx = ((decoFunc && decoFunc(tx, hdr, msg, opts)) || tx);
      }());
      msg.text = tx;
      msg.textLengthUCS2 = tx.length;
    }

    if (falseOrOr(opts.simpleUniqueHeaders, true)) {
      hdr = transkey(function (k, v) {
        if (v.join && (v.length === 1)) { v = v[0]; }
        return [k, v];
      }, hdr);
    }
    if (transkeyHdr) { hdr = transkey(transkeyHdr, hdr); }
    msg.headers = hdr;
  }

  return prettifyMsg;
};


EX.decodeTE_quotedPrintable = quotedPrintable.decode;
EX.decodeTE_base64 = base64decode;











module.exports = EX;
