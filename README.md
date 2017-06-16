
<!--#echo json="package.json" key="name" underline="=" -->
imapfetch-collect
=================
<!--/#echo -->

<!--#echo json="package.json" key="description" -->
Simplified abstraction for the `fetch` method of the `imap` module. Get a
callback instead of streams within streams.
<!--/#echo -->


API
---

This module exports one function:

### imapFetchCollect(fetcher, [opts,] whenFetched)

* `fetcher`: The `ImapFetch` object returned by the `imap` module's `fetch`
  method.
* `opts`: Optional options object, see below.
* `whenFetched`: Your callback (nodeback).
  It will receive two arguments: `(err, msgs)`,
  where `msgs` is an Array of messages that were received successfully
  ([example data](docs/msgs-array-example-01.json)),
  and `err` is the first error that was encountered,
  or some false-y value on success.

If you need progress information, you can add your own event listeners to
the `fetcher`. `imapFetchCollect`'s event handlers shouldn't interfere
with others.


Options
-------

* `translateHeaderNames`:
  Whether and how to rewrite header field names,
  using the `transkey` module.
  * `false`, `null`, `undefined` (default): Don't.
  * a Function: Custom synchronous translater function.
  * `"dash2camel"`: Translate to camelCase, e.g. `from`, `to`,
    `xOriginalTo`, `messageId`, `contentTransferEncoding`

* `maxDecodeBytes`:
  How much of a text buffer to decode automatically. Can be
  * any false-y value (e.g. `0`): Use some default value of a few megabytes.
  * a positive Number: Up to that many bytes.
  * `true`: Decode ALL the text.

* `simpleUniqueHeaders`:
  Whether to unpack header value arrays that contain only one value.
  Boolean, default: `true`


Usage
-----

<!--!#include file="test/usage.js" start="  //#u" stop="  //#r"
  outdent="  " code="javascript" -->
```javascript
var ImapConnection = require('imap'),
  imapFetchCollect = require('imapfetch-collect');

function onMailFetched(err, msgs) {
  if (err) { throw err; }
  console.log('fetched', msgs.length, 'message(s)');
  var msg1 = msgs[0];
  console.log('first mail headers:', Object.keys(msg1.rawHeaders));
  console.log('first body:', msg1.bodies[0].text);
}

function checkMail() {
  // … login, search, …
  function onSearchSuccess(foundUIDs) {
    var fetcher = imapConn.fetch(foundUIDs, fetchOpts);
    imapFetchCollect(fetcher, onMailFetched);
  }
}
```
<!--/include-->


<!--#toc stop="scan" -->


Simplification drawbacks
------------------------

* In case of multiple errors within the same fetch attempt,
  all but one are silently ignored.
* All messages are buffered into memory. You don't get a chance to ignore
  some message body based on the message's size or headers.


Known issues
------------

* needs more/better tests and docs




&nbsp;


License
-------
<!--#echo json="package.json" key=".license" -->
ISC
<!--/#echo -->
