const bindObject = require('simulacra');

const listeners = require('./listeners');
const actions = require('./actions');

module.exports = function( transport ) {
  let state = {
    name: "Anonymous",
    messages: [],
    initialized: false
  };

  let template = document.getElementById( 'chat-template' );
  let node = bindObject( state, [ template, {
    messages: '#messages'
  }]);
  document.getElementById( 'main' ).appendChild( node );

  actions( state );

  transport.onmessage = function( event ) {
    state = listeners[ event.type ]( state, event.data );
  }
};
