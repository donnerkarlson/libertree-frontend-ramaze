$(document).ready( function() {

  $('#menu-account').click( function() {
    var show_window = ! $('#account-window').is(':visible');
    Libertree.UI.hideWindows();
    if (show_window) {
      $('#account-window').show();
    }
    return false;
  } );

  $(document).on('click', '#toggle-sidebar', function(event) {
    event.preventDefault();
    Libertree.UI.toggleSidebar();
  } );

  // bootstrap popovers for additional information
  $("a[rel=popover]")
    .popover()
    .click(function() {
      return false;
    });

  $(document).on('click', 'a[rel="confirm"]', Libertree.UI.confirmAction);

  $(document).click( function(event) {
    var t = $(event.target);
    if( t.closest('.window').length === 0 && ! t.hasClass('result-selected') ) {
      Libertree.UI.hideWindows();
    }
    // hide all popovers
    $("a[rel=popover]").popover('hide');
  } );

  $(document).on('click', 'input.preview', Libertree.UI.renderPreview);

  $(document).on('click', '.preview-box a.close-preview', function() {
    $(this).closest('.preview-box').remove();
    return false;
  } );

  $(document).on('click', '.textarea-clear', function() {
    var id = $(this).data('textarea-id');
    $('#'+id).val('');
    $.get( '/textarea_clear/' + id );
  } );

  $(document).on('click', '.markdown-injector a', Libertree.UI.markdownInjector);

  $('textarea, input[type="text"]').libertreeAutocomplete( {
    delay: 500,
    source: function( request, response ) {
      var entireText = request.term,
          textUpToCursor = entireText.substring(0, this.element.textCursorPosition()),
          indexOfAtSymbol = textUpToCursor.search(/@\S{2,}$/);  /* require at least 2 characters */

      if(
        indexOfAtSymbol == -1 ||
        textUpToCursor.charAt(indexOfAtSymbol-1).search(/\S/) > -1  /* Non-space before at symbol */
      ) {
        return response([]);
      }

      var autocompletableWord = textUpToCursor.substring(indexOfAtSymbol+1),
          post = $(this.element).closest('[data-post-id]'),
          post_id;

      if( post.length ) {
        post_id = post.data('post-id');
      }

      $.get(
        '/members/autocomplete_handle.json?q='+autocompletableWord+'&commenters_of_post_id='+post_id,
        function(data) {
          var selections = [];
          if( data.commenting_members.length && data.members.length ) {
            selections = data.commenting_members.concat(['---------']).concat(data.members);
          } else if( data.members.length ) {
            selections = data.members;
          } else if( data.commenting_members.length ) {
            selections = data.commenting_members;
          }

          response(selections);
        });
    },
    focus: Libertree.UI.memberHandleAutocompletion,
    change: Libertree.UI.memberHandleAutocompletion,
    select: Libertree.UI.memberHandleAutocompletion
  } );
} );
