import styles from './NodePreview.module.css';

type Node = {
  id: string;
  title: string;
  videoUrl?: string | null;
  muxPlaybackId?: string | null;
};

function youtubeEmbedUrl(url: string) {
  const yMatch = url.match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?v=|embed\/|v\/))([\w-]{11})/);
  if (yMatch) return `https://www.youtube-nocookie.com/embed/${yMatch[1]}?rel=0`;
  return null;
}

function vimeoEmbedUrl(url: string) {
  const m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (m) return `https://player.vimeo.com/video/${m[1]}`;
  return null;
}

export default function NodePreview({ node }: { node: Node }) {
  const url = node.videoUrl ?? null;
  const mux = node.muxPlaybackId ?? null;

  if (!url && !mux) {
    return <span className={styles.title}>{node.title}</span>;
  }

  // Prefer explicit videoUrl embeds
  if (url) {
    const youtube = youtubeEmbedUrl(url);
    if (youtube) {
      return (
        <div className={styles.preview}>
          <iframe
            title={`${node.title} (YouTube preview)`}
            src={youtube}
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className={styles.iframe}
          />
        </div>
      );
    }

    const vimeo = vimeoEmbedUrl(url);
    if (vimeo) {
      return (
        <div className={styles.preview}>
          <iframe
            title={`${node.title} (Vimeo preview)`}
            src={vimeo}
            frameBorder="0"
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
            className={styles.iframe}
          />
        </div>
      );
    }

    // MP4 or direct file
    if (url.endsWith('.mp4') || url.includes('.m3u8') || url.includes('blob:')) {
      return (
        <div className={styles.preview}>
          <video controls className={styles.video}>
            <source src={url} />
            Your browser does not support the video tag.
          </video>
        </div>
      );
    }

    // Fallback: iframe the url
    return (
      <div className={styles.preview}>
        <iframe title={`${node.title} (Preview)`} src={url} frameBorder="0" className={styles.iframe} />
      </div>
    );
  }

  // Mux fallback: try HLS stream URL -- works on Safari; other browsers may require hls.js
  if (mux) {
    const hls = `https://stream.mux.com/${mux}.m3u8`;
    return (
      <div className={styles.preview}>
        <video controls className={styles.video}>
          <source src={hls} />
          Your browser does not support HLS playback natively.
        </video>
      </div>
    );
  }

  return <span className={styles.title}>{node.title}</span>;
}
