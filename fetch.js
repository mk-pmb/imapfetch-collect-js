/*jslint indent: 2, maxlen: 80, continue: false, unparam: false, node: true */
/* -*- tab-width: 2 -*- */
'use strict';

module.exports = (function () {
  var EX, parseHeader = require('imap').parseHeader,
    posInf = Number.POSITIVE_INFINITY,
    transkey = require('transkey'),
    headerEol = '\r\n',   // https://github.com/mscdex/node-imap/issues/621
    collectStream = require('collect-stream');

  function ifFun(x, d) { return ((typeof x) === 'function' ? x : d); }
  function ifTrue(x, t) { return (x === true ? t : x); }
  function limitSlice(x, l) { return (x.length > l ? x.slice(0, l) : x); }

  EX = function imapFetchCollect(fetcher, opts, whenFetched) {
    if (!ifFun(whenFetched)) {
      if (ifFun(opts)) {
        whenFetched = opts;
        opts = false;
      }
    }
    var msgs = [], whyFailed = null, dfOpt = EX.defaultOpts,
      maxDecodeBytes = (+ifTrue(opts.maxDecodeBytes, posInf)
        || dfOpt.maxDecodeBytes);

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
      var rawHeaders = [], msg = { seqno: seqno,
        headers: false,
        getRawHeaders: function getRawHeaders() { return rawHeaders; },
        bodies: [],
        };

      function updAttr(attr) {
        Object.assign(msg, attr);
      }
      reader.on('attributes', updAttr);

      function startRecvBody(bodyStream, meta) {
        if (whyFailed) { return; }
        function saveRecvdBody(err, bodyBuffer) {
          if (whyFailed) { return; }
          if (err) { fail(err); }
          var bodyInfo = meta, isHeader = (meta.which === 'HEADER'), tx;
          if (isHeader) {
            rawHeaders.push(bodyInfo);
          } else {
            bodyInfo.getRawBuffer = function () { return bodyBuffer; };
            msg.bodies.push(bodyInfo);
          }
          tx = limitSlice(bodyBuffer, maxDecodeBytes).toString('UTF-8');
          bodyInfo.text = tx;
          bodyInfo.ucs2_length = tx.length;
        }
        collectStream(bodyStream, saveRecvdBody);
      }
      reader.on('body', startRecvBody);

      function finishMsg() {
        msgs.push(msg);
        addMsgByUID(msg);
        var hdr = EX.parseCombinedHeaders(rawHeaders,
          opts.translateHeaderNames);
        if (opts.simpleUniqueHeaders !== false) {
          hdr = transkey(function (k, v) {
            if (v.join && (v.length === 1)) { v = v[0]; }
            return [k, v];
          }, hdr);
        }
        msg.headers = hdr;
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


  EX.parseCombinedHeaders = function (rawHeaders, translate) {
    rawHeaders = rawHeaders.map(function (h) { return h.text; }
      ).join('\n').replace(/\r*\n[\r\n]*/g, headerEol);
    var hdr = parseHeader(rawHeaders);
    if (translate) { hdr = transkey(translate, hdr); }
    return hdr;
  };


  return EX;
}());
