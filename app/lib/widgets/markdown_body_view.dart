import 'package:flutter/material.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:video_player/video_player.dart';
import '../config/theme.dart';

/// Renders a message body that may contain Markdown: headings, bold/italic,
/// lists, code, links, images (![](url)) and inline videos
/// ([video](url.mp4) or [](...mp4|mov|m3u8|webm)).
///
/// Media URLs that are relative are resolved against [baseUrl] when given
/// (e.g. the Firebase DB origin), so cloud bodies like
/// `![chart](/img/chart.png)` still load.
class MarkdownBodyView extends StatelessWidget {
  final String body;
  final String? baseUrl;
  final bool selectable;

  const MarkdownBodyView({
    super.key,
    required this.body,
    this.baseUrl,
    this.selectable = false,
  });

  String _resolve(String url) {
    final u = url.trim();
    if (u.startsWith('http://') || u.startsWith('https://')) return u;
    if (baseUrl == null || baseUrl!.isEmpty) return u;
    try {
      return Uri.parse(baseUrl!).resolve(u).toString();
    } catch (_) {
      return u;
    }
  }

  @override
  Widget build(BuildContext context) {
    return MarkdownBody(
      data: body,
      selectable: selectable,
      styleSheet: _style(context),
      // Media links: [video](x.mp4) renders an inline player; other links
      // open externally. Images go through the themed builder below.
      imageBuilder: (uri, title, alt) => _MdImage(
          url: _resolve(uri.toString()), alt: alt ?? title ?? ''),
      onTapLink: (text, href, title) async {
        final hrefStr = href ?? '';
        // Inline video markdown: [video](url) or a direct media link.
        if (_isVideoLink(hrefStr)) {
          await Navigator.of(context).push(MaterialPageRoute(
            builder: (_) => Scaffold(
              backgroundColor: AppColors.bg,
              appBar: AppBar(
                backgroundColor: AppColors.bg,
                elevation: 0,
                title: const Text('Video',
                    style: TextStyle(
                        color: AppColors.heading,
                        fontSize: 16,
                        fontWeight: FontWeight.w600)),
              ),
              body: Center(
                  child: VideoPlayerView(url: _resolve(hrefStr))),
            ),
          ));
          return;
        }
        final url = Uri.tryParse(hrefStr);
        if (url == null) return;
        try {
          await launchUrl(url, mode: LaunchMode.externalApplication);
        } catch (_) {}
      },
    );
  }

  static bool _isVideoLink(String url) {
    final u = url.toLowerCase();
    return u.endsWith('.mp4') ||
        u.endsWith('.mov') ||
        u.endsWith('.webm') ||
        u.endsWith('.m3u8') ||
        u.endsWith('.mkv');
  }

  MarkdownStyleSheet _style(BuildContext context) {
    final base = MarkdownStyleSheet.fromTheme(ThemeData(
      textTheme: const TextTheme(bodyMedium: TextStyle(fontSize: 14.5)),
    ));
    return base.copyWith(
      p: const TextStyle(color: AppColors.body, fontSize: 14.5, height: 1.5),
      h1: const TextStyle(
          color: AppColors.heading,
          fontSize: 19,
          fontWeight: FontWeight.w700),
      h2: const TextStyle(
          color: AppColors.heading,
          fontSize: 17,
          fontWeight: FontWeight.w700),
      h3: const TextStyle(
          color: AppColors.heading,
          fontSize: 15.5,
          fontWeight: FontWeight.w700),
      h4: const TextStyle(
          color: AppColors.heading,
          fontSize: 14.5,
          fontWeight: FontWeight.w600),
      h5: const TextStyle(
          color: AppColors.heading,
          fontSize: 14,
          fontWeight: FontWeight.w600),
      h6: const TextStyle(
          color: AppColors.muted,
          fontSize: 13.5,
          fontWeight: FontWeight.w600),
      listBullet: const TextStyle(color: AppColors.accent, fontSize: 14.5),
      strong: const TextStyle(
          color: AppColors.heading, fontWeight: FontWeight.w700),
      em: const TextStyle(color: AppColors.body, fontStyle: FontStyle.italic),
      a: const TextStyle(
          color: AppColors.accentDark,
          decoration: TextDecoration.underline),
      blockquote: const TextStyle(color: AppColors.muted, fontSize: 14),
      blockquoteDecoration: BoxDecoration(
        color: AppColors.accentSoft,
        borderRadius: BorderRadius.circular(10),
      ),
      code: const TextStyle(
          fontFamily: 'monospace',
          fontSize: 13,
          color: AppColors.accentDark,
          backgroundColor: AppColors.accentSoft),
      codeblockDecoration: BoxDecoration(
        color: const Color(0xFF2E2A26),
        borderRadius: BorderRadius.circular(14),
      ),
      codeblockPadding: const EdgeInsets.all(12),
      blockquotePadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      horizontalRuleDecoration: BoxDecoration(
        border: Border(top: BorderSide(color: AppColors.trackOff, width: 1)),
      ),
      tableHead: const TextStyle(
          color: AppColors.heading, fontWeight: FontWeight.w700, fontSize: 13.5),
      tableBody: const TextStyle(color: AppColors.body, fontSize: 13.5),
      tableCellsDecoration: BoxDecoration(
        border: Border.all(color: AppColors.trackOff, width: 0.8),
        borderRadius: BorderRadius.circular(6),
      ),
    );
  }
}

/// Image with Soft Day rounded corners, placeholder and error fallback.
class _MdImage extends StatefulWidget {
  final String url;
  final String alt;
  const _MdImage({required this.url, required this.alt});

  @override
  State<_MdImage> createState() => _MdImageState();
}

class _MdImageState extends State<_MdImage> {
  bool _failed = false;

  @override
  Widget build(BuildContext context) {
    if (_failed || widget.url.isEmpty) {
      return Container(
        margin: const EdgeInsets.symmetric(vertical: 6),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: AppColors.accentSoft,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.broken_image_outlined,
                size: 18, color: AppColors.accentDark),
            const SizedBox(width: 8),
            Flexible(
              child: Text(
                _failed ? 'Image unavailable' : 'image',
                style:
                    const TextStyle(fontSize: 12.5, color: AppColors.accentDark),
              ),
            ),
          ],
        ),
      );
    }
    return ClipRRect(
      borderRadius: BorderRadius.circular(14),
      child: Image.network(
        widget.url,
        fit: BoxFit.cover,
        errorBuilder: (_, __, ___) {
          // Defer state change to post-frame to avoid build-phase mutations.
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (mounted) setState(() => _failed = true);
          });
          return const SizedBox.shrink();
        },
        loadingBuilder: (context, child, progress) {
          if (progress == null) return child;
          return Container(
            height: 120,
            width: 220,
            color: AppColors.cardAlt,
            alignment: Alignment.center,
            child: const SizedBox(
              width: 22,
              height: 22,
              child: CircularProgressIndicator(
                  strokeWidth: 2, color: AppColors.accent),
            ),
          );
        },
      ),
    );
  }
}

/// Inline video player for [video](url) markdown links.
class VideoPlayerView extends StatefulWidget {
  final String url;
  const VideoPlayerView({super.key, required this.url});

  @override
  State<VideoPlayerView> createState() => _VideoPlayerViewState();
}

class _VideoPlayerViewState extends State<VideoPlayerView> {
  VideoPlayerController? _controller;
  bool _failed = false;
  bool _initialized = false;

  @override
  void initState() {
    super.initState();
    _init();
  }

  Future<void> _init() async {
    final uri = Uri.tryParse(widget.url);
    if (uri == null) {
      setState(() => _failed = true);
      return;
    }
    final c = VideoPlayerController.networkUrl(uri);
    try {
      await c.initialize();
      if (!mounted) {
        c.dispose();
        return;
      }
      setState(() {
        _controller = c;
        _initialized = true;
      });
    } catch (_) {
      if (mounted) setState(() => _failed = true);
      c.dispose();
    }
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_failed) {
      return Container(
        margin: const EdgeInsets.symmetric(vertical: 6),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: AppColors.accentSoft,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.videocam_off_outlined,
                size: 18, color: AppColors.accentDark),
            const SizedBox(width: 8),
            const Flexible(
              child: Text('Video unavailable',
                  style:
                      TextStyle(fontSize: 12.5, color: AppColors.accentDark)),
            ),
          ],
        ),
      );
    }
    if (!_initialized || _controller == null) {
      return Container(
        height: 140,
        margin: const EdgeInsets.symmetric(vertical: 6),
        decoration: BoxDecoration(
          color: AppColors.cardAlt,
          borderRadius: BorderRadius.circular(14),
        ),
        child: const Center(
          child: SizedBox(
            width: 24,
            height: 24,
            child: CircularProgressIndicator(
                strokeWidth: 2, color: AppColors.accent),
          ),
        ),
      );
    }
    final c = _controller!;
    return Container(
      margin: const EdgeInsets.symmetric(vertical: 6),
      decoration: BoxDecoration(
        color: Colors.black,
        borderRadius: BorderRadius.circular(14),
      ),
      clipBehavior: Clip.antiAlias,
      child: Stack(
        alignment: Alignment.bottomCenter,
        children: [
          AspectRatio(
            aspectRatio: c.value.aspectRatio,
            child: VideoPlayer(c),
          ),
          // Tap-to-toggle play/pause like WhatsApp's inline player.
          Positioned.fill(
            child: GestureDetector(
              onTap: () {
                setState(() {
                  c.value.isPlaying ? c.pause() : c.play();
                });
              },
              child: Container(
                color: Colors.transparent,
                alignment: Alignment.center,
                child: c.value.isPlaying
                    ? const SizedBox.shrink()
                    : Container(
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: Colors.black45,
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(Icons.play_arrow,
                            color: Colors.white, size: 30),
                      ),
              ),
            ),
          ),
          Positioned(
            left: 8,
            right: 8,
            bottom: 6,
            child: VideoProgressIndicator(
              c,
              allowScrubbing: true,
              colors: const VideoProgressColors(
                playedColor: AppColors.accent,
                backgroundColor: Colors.white24,
                bufferedColor: Colors.white54,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
