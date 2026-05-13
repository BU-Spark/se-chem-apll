'use client';

import { useRef, useEffect } from 'react';
import Hls from 'hls.js';
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
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!mux) return;
    const video = videoRef.current;
    if (!video) return;
    const hlsUrl = `https://stream.mux.com/${mux}.m3u8`;

    // If the browser can play HLS natively (Safari), set src directly
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = hlsUrl;
      return;
    }

    // Otherwise use hls.js when supported
    if (Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(hlsUrl);
      hls.attachMedia(video);
      return () => {
        hls.destroy();
      };
    }

    // Fallback: set src, may not work in all browsers
    video.src = hlsUrl;
  }, [mux]);

  if (!url && !mux) {
    return (
      <div className={styles.nodeCard}>
        <p className={styles.title}>{node.title}</p>
      </div>
    );
  }

  // Prefer explicit videoUrl embeds
  if (url) {
    const youtube = youtubeEmbedUrl(url);
    if (youtube) {
      return (
        <div className={styles.nodeCard}>
          <p className={styles.title}>{node.title}</p>
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
        <div className={styles.nodeCard}>
          <p className={styles.title}>{node.title}</p>
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
        <div className={styles.nodeCard}>
          <p className={styles.title}>{node.title}</p>
          <video ref={videoRef} controls className={styles.video} playsInline>
            <source src={url} />
            Your browser does not support the video tag.
          </video>
        </div>
      );
    }

    // Fallback: iframe the url
    return (
      <div className={styles.nodeCard}>
        <p className={styles.title}>{node.title}</p>
        <iframe title={`${node.title} (Preview)`} src={url} frameBorder="0" className={styles.iframe} />
      </div>
    );
  }

  // Mux fallback: HLS handled in useEffect; render video element for attachment
  if (mux) {
    return (
      <div className={styles.nodeCard}>
        <p className={styles.title}>{node.title}</p>
        <video ref={videoRef} controls className={styles.video} playsInline>
          <source />
          Your browser does not support HLS playback natively.
        </video>
      </div>
    );
  }

  return (
    <div className={styles.nodeCard}>
      <p className={styles.title}>{node.title}</p>
    </div>
  );
}
