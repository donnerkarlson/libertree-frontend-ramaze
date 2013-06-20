/*jslint white: true, indent: 2, todo: true */
/*global $, Libertree */

$(document).ready( function() {
  "use strict";

  var wantsToComment = false,
    scrollable = Libertree.UI.scrollable();

  $(document).on('click', '#post-new input[type="submit"]', function() {
    $('#post-new .message').hide();
    $.post(
      '/posts/create.json',
      $('#post-new').serialize(),
      function(result) {
        if( ! result.success ) {
          $('#post-new .message').
            addClass('error').
            text(result.error).
            show()
          ;
        } else {
          $('#post-new .message').
            removeClass('error').
            text(result.message).
            show()
          ;
          $('#textarea-post-new').val('');
          if( result.matchesRiver ) {
            $.get(
              '/posts/_excerpt/' + result.postId,
              function(html) {
                var o = $( $.trim(html) ),
                  verticalDelta,
                  animationDuration
                ;

                o.insertBefore('#post-excerpts .post-excerpt:first');
                /* Adjust by 60 pixels to account for navigation bar */
                verticalDelta = o.offset().top - scrollable.scrollTop() - 60;
                animationDuration = verticalDelta*2;

                o.hide().slideDown(animationDuration);

                scrollable.animate(
                  { scrollTop: scrollable.scrollTop() + verticalDelta },
                  animationDuration
                );
              }
            );
          }
        }
      }
    );

    return false;
  } );

  $(document).on('keydown', '#textarea-post-new', function(event) {
    if( $('#post-new .message').is(':visible') ) {
      $('#post-new .message').slideUp();
    }
  } );

  $(document).on('click', '.post-excerpt .show-more', function() {
    var showMoreLink = $(this),
      excerpt = showMoreLink.siblings('.excerpt'),
      overflowed = excerpt.find('.overflowed'),
      excerptParent = showMoreLink.closest('.post-excerpt'),
      postId = excerptParent.data('post-id'),
      comments = excerptParent.find('div.comments'),
      commentHeight = comments.get(0).scrollHeight,
      heightDifference,
      animationDuration,
      scrollable,
      scrollTop,
      excerptTruncation;

    Libertree.Posts.markRead(postId);
    showMoreLink.hide();

    //TODO: don't do this. Record the excerpt height somewhere and operate on that.
    overflowed.data( 'contracted-height', overflowed.height() );

    excerptParent.find('div.comments.hidden').removeClass('hidden');
    heightDifference = excerpt.get(0).scrollHeight - overflowed.height();
    animationDuration = Libertree.UI.duration(heightDifference);

    overflowed.animate(
      {
        height: excerpt.get(0).scrollHeight + 'px',
        'max-height': excerpt.get(0).scrollHeight + 'px'
      },
      animationDuration,
      function() {
        /* cancel explicit height set by animation */
        overflowed.height('auto');
        overflowed.css('max-height', 'none');
        showMoreLink.siblings('.show-less').show();
      }
    );

    if( wantsToComment ) {
      scrollable = Libertree.UI.scrollable();
      scrollTop = scrollable.scrollTop();
      excerptTruncation = excerpt.position().top + excerpt.height() - scrollTop - $(window).height();
      if( excerptTruncation < 0 ) {
        excerptTruncation = 0;
      }
      scrollable.animate(
        { scrollTop: scrollTop + heightDifference + excerptTruncation },
        animationDuration,
        function() {
          excerpt.find('textarea.comment').focus();
          wantsToComment = false;
        }
      );
    }

    return false;
  } );

  $(document).on('click', '.post-excerpt .show-less', function() {
    var link = $(this),
      excerpt = link.closest('.post-excerpt'),
      overflowed = excerpt.find('.overflowed'),
      comments = excerpt.find('div.comments'),
      distance = excerpt.height() - overflowed.data('contracted-height'),
      animationDuration = Libertree.UI.duration(distance),
      excerptTop = excerpt.position().top,
      scrollable = Libertree.UI.scrollable(),
      windowTop = scrollable.scrollTop(),
      scrollTop = excerptTop - windowTop;

    link.hide();

    if( scrollTop < 100 ){
      scrollable.animate(
        { scrollTop: windowTop + ( scrollTop - 100 ) },
        animationDuration
      );
    }

    overflowed.animate(
      { height: overflowed.data('contracted-height')+'px' },
      animationDuration,
      function() {
        $(this).closest('.post-excerpt').find('div.comments').addClass('hidden');
        link.siblings('.show-more').show();
      }
    );

    return false;
  } );

  scrollable.mousewheel( function(event, delta, deltaX, deltaY) {
    scrollable.stop();
  } );

  $(document).on('click', '.post-excerpt .post-tools a.comment', function(event) {
    event.preventDefault();
    var excerpt = $(this).closest('.post-excerpt');
    wantsToComment = true;
    excerpt.find('.show-more').click();
  } );

  /* Displays "show more" when hovering over an image.
     This is necessary for two reasons:
     - when the image has not been loaded yet, the post contents
       might not immediately overflow.
     - per account setting, images may be displayed as thumbnails,
       only overflowing the container on hover
  */
  $(document).on('mouseover', '.overflowed img', function() {
    // do not do anything when this post is currently being expanded
    var excerpt = $(this).closest('.excerpt'),
      overflowed = excerpt.find('.overflowed').not(':animated');

    // NOTE: we cannot use Libertree.UI.showShowMores() because that would inspect *all* excerpts
    if( overflowed.length > 0 && excerpt.find('.post-text').height() > overflowed.height() ) {
      excerpt.siblings('.show-more').show();
    }
  } );

  $(document).on('click', '.load-more', function(event) {
    event.preventDefault();

    $('#no-more-posts').remove();
    $('.more-posts-divider').removeClass('more-posts-divider');
    $('.post-excerpt:first').addClass('more-posts-divider');

    Libertree.UI.addSpinner($(this).parent(), 'append');
    Libertree.PostLoader.loadFromRiver(
      $('#post-excerpts').data('river-id'),
      'newer',
      $('.post-excerpt:first').data('t'),
      function() {
        $('.more-posts').hide().detach().prependTo('#post-excerpts');
        $('.more-posts .n').text('0');
      }
    );
  } );

  /* ---------------------------------------------------- */

  Libertree.UI.showShowMores();
} );
