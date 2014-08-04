# encoding: utf-8
require 'net/http'
require 'nokogiri'
require 'libertree/model'

module Libertree
  RenderOptions = [ :filter_html,
                    :smart,
                    :strike,
                    :autolink,
                    :hard_wrap,
                    :notes,
                    :codeblock,
                    :hashtags,
                    :usernames,
                    :spoilerblock
                  ]

  def self.markdownify(s, opts = RenderOptions)
    return ''  if s.nil? or s.empty?
    Markdown.new( s, *opts ).to_html.force_encoding('utf-8')
  end

  def self.hashtaggify(s)
    return ''  if s.nil? or s.empty?
    s.gsub(/(?<=^|\p{Space}|\()#([\p{Word}\p{Pd}]+)(?=\p{Space}|\b|\)|$)/i) {
      %|<a href="/tags/#{$1.downcase}" class="hashtag">##{$1}</a>|
    }
  end

  # @param [String] rendered markdown as HTML string
  def self.autolinker(s)
    return ''  if s.nil? or s.empty?

    # Crude autolinker for relative links to local resources

    # NOTE: when the :smart extension is enabled,
    # "/posts/show/987/123/#comment-123" is turned into
    # "<p>/posts/show/987/123/#comment&ndash;123</p>".

    s.gsub(%r{(?<=^|\(|\[|\p{Space}|^<p>|^<li>)<?(/posts/show/\d+(/\d+/?(#comment(&ndash;|-)\d+)?|/(\d+/?)?)?)>?}) {
      url = $1.gsub('&ndash;', '-')
      "<a href='#{url}'>#{url}</a>"
    }
  end

  # @param [Nokogiri::HTML::DocumentFragment] parsed HTML tree
  def self.process_links(html)
    html.css('a').each do |a|
      # strip javascript
      if a['href']
        a['href'] = a['href'].gsub(/javascript:/i, 'nojavascript:')
      end
      # resolve uris
      if a['href'] =~ %r{http://} && ! a['href'].start_with?($conf['frontend_url_base'])
        a['href'] = resolve_redirection(a['href'])
      end
    end
    html
  end

  # @param [Nokogiri::HTML::DocumentFragment] parsed HTML tree
  def self.apply_hashtags(html)
    html.xpath('.//span[@rel="hashtag"]').each {|n| n.replace(hashtaggify(n.content)) }
    html
  end

  # a render stage replacing <span rel='username'/> tags with commenter references
  # if the contained username is that of a participant in the comment thread
  def self.comment_jid_linker(html, commenters)
    html.xpath('.//span[@rel="username"]').each do |n|
      handle = n.content[1..-1].downcase
      if commenter = commenters[handle]
        display_name = ::CGI.escape_html(commenter[:name])
        content = %|<a class="commenter-ref" data-member-id="#{commenter[:id]}" title="#{_("Click to see previous comment by %s") % display_name}">@#{display_name}</a>|
        n.replace(content)
      end
    end
    html
  end

  # a render stage replacing <span rel='username'/> tags with display names
  def self.jid_renderer(html)
    html.xpath('.//span[@rel="username"]').each do |n|
      handle = n.content[1..-1].downcase
      if member = Libertree::Model::Member.with_handle(handle)
        display_name = ::CGI.escape_html(member.name_display)
        content = %|<a href="/profiles/show/#{member.id}" class="member-name" title="#{member.handle}">@#{member.name_display}</a>|
        n.replace(content)
      end
    end
    html
  end

  def self.resolve_redirection( url_s )
    cached = Libertree::Model::UrlExpansion[ url_short: url_s ]
    if cached
      return cached.url_expanded
    end

    resolution = url_s
    begin
      url = URI.parse(url_s)
      res = nil
      num_redirections = 0

      timeout(3) do
        while num_redirections < 8
          if url.host && url.port
            host, port = url.host, url.port
          else
            break
          end

          res = Net::HTTP.get_response(url)

          if res.header['location']
            url = URI.parse(res.header['location'])
            num_redirections += 1
          else
            resolution = url.to_s
            break
          end
        end
      end
    rescue SocketError, Timeout::Error, URI::InvalidURIError, IOError, Errno::ECONNREFUSED, Errno::ECONNRESET, Net::HTTPBadResponse, ArgumentError, OpenSSL::SSL::SSLError, Zlib::BufError
      # Use URL as is.  Arbo can delete url_expansions record to force retry.
    rescue StandardError => e
      Ramaze::Log.error e
    end

    begin
      Libertree::Model::UrlExpansion.create(
        :url_short => url_s,
        :url_expanded => resolution
      )
    rescue PGError => e
      if e.message =~ /url_expansions_url_short_key/
        # expansion already exists, ignore
      else
        # silently fail
        resolution = url_s
        Ramaze::Log.error e
      end
    end

    resolution
  end

  def self.render_unsafe(s)
    Markdown.new(
      s,
      :strike,
      :autolink,
      :hard_wrap
    ).to_html.force_encoding('utf-8')
  end

  # filter HTML but ignore markdown
  def self.plain(s, opts=nil)
    Nokogiri::HTML.fragment(self.markdownify(s, opts)).inner_text
  end

  def self.render(s, settings={}, pipeline_steps=[])
    opts = Libertree::RenderOptions.dup
    opts.push :no_images  if settings[:filter_images]
    opts.push :media      if settings[:autoembed]

    pipeline = [
      method(:autolinker),
      Nokogiri::HTML.method(:fragment),
      method(:process_links),
      method(:apply_hashtags),
      (Embedder.method(:inject_objects)  if settings[:autoembed])
    ]

    # append additional render stages
    pipeline += pipeline_steps
    pipeline.compact!

    # apply methods sequentially to string
    pipeline.reduce(markdownify(s, opts)) {|acc,f| f.call(acc)}.to_s
  end

  module HasRenderableText
    def text_rendered(account, pipeline_steps=[])
      settings = if account.respond_to?(:settings)
                   account.settings
                 else
                   {}
                 end
      Libertree.render(self.text, settings, pipeline_steps)
    end
  end

  module Model
    class Post
      include Libertree::HasRenderableText

      # render JIDs as display names
      def text_rendered(account, pipeline_steps=[])
        linker = Libertree.method(:jid_renderer)
        steps = if pipeline_steps.nil?
                  [linker]
                else
                  pipeline_steps + [linker]
                end
        super(account, steps)
      end
    end
    class Comment
      include Libertree::HasRenderableText

      # render comment text with additional render stage
      def text_rendered_and_participants_linked( commenters, account=nil, i=nil )
        linker = lambda {|html| Libertree.comment_jid_linker(html, commenters)}
        self.text_rendered(account, [linker])
      end
    end
    class Message
      include Libertree::HasRenderableText
    end
    class ChatMessage
      include Libertree::HasRenderableText
    end
  end
end
