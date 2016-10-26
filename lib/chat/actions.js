module.exports = function( state ) {
  let input = document.getElementById( 'input' ),
      submit = document.getElementById( 'submit' );

  submit.addEventListener( 'click', function (event) {
    event.preventDefault();
    state.messages.push( input.value );
    input.value = '';
  });
}
