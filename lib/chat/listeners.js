module.exports = {
  message: function (state, data) {
    state.messages.push( data );
    return state;
  }
}
