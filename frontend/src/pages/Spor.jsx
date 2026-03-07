import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';

function Spor() {
  const videoRef = useRef(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    console.log('Spor component mounted');
    const video = videoRef.current;
    const videoSrc = 'https://white-sky-0cce.esraerolsk2.workers.dev/https://corestream.ronaldovurdu.help//hls/bein-sports-1.m3u8';

    if (!video) {
      console.error('Video element not found');
      return;
    }

    console.log('Video element found, checking HLS support...');

    if (Hls.isSupported()) {
      console.log('HLS.js is supported, initializing...');
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 90,
        debug: false,
      });

      hls.loadSource(videoSrc);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        console.log('Manifest parsed, starting playback...');
        setIsLoading(false);
        video.play().catch(err => {
          console.log('Auto-play prevented:', err);
          setError('Lütfen oynat butonuna tıklayın');
        });
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        console.error('HLS Error:', data);
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.log('Network error, trying to recover...');
              setError('Ağ hatası, yeniden deneniyor...');
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.log('Media error, trying to recover...');
              setError('Medya hatası, düzeltiliyor...');
              hls.recoverMediaError();
              break;
            default:
              console.log('Fatal error, destroying HLS instance');
              setError('Yayın başlatılamadı');
              hls.destroy();
              break;
          }
        }
      });

      return () => {
        console.log('Cleaning up HLS instance');
        hls.destroy();
      };
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // For Safari native HLS support
      console.log('Using native HLS support (Safari)');
      video.src = videoSrc;
      video.addEventListener('loadedmetadata', () => {
        console.log('Metadata loaded');
        setIsLoading(false);
        video.play().catch(err => {
          console.log('Auto-play prevented:', err);
          setError('Lütfen oynat butonuna tıklayın');
        });
      });
    } else {
      console.error('HLS not supported');
      setError('Tarayıcınız HLS desteklemiyor');
      setIsLoading(false);
    }
  }, []);

  return (
    <div style={{ 
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      backgroundColor: '#000',
      zIndex: 9999
    }}>
      <div style={{ 
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Header */}
        <div style={{
          background: 'linear-gradient(90deg, #1e40af 0%, #1e3a8a 100%)',
          padding: '16px 24px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
        }}>
          <h1 style={{
            fontSize: '24px',
            fontWeight: 'bold',
            color: 'white',
            margin: 0,
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <span>⚽</span>
            Canlı Spor Yayını
          </h1>
          <div style={{
            marginLeft: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            color: 'white',
            fontSize: '14px'
          }}>
            <span style={{
              width: '12px',
              height: '12px',
              backgroundColor: '#ef4444',
              borderRadius: '50%',
              display: 'inline-block',
              animation: 'pulse 2s infinite'
            }}></span>
            CANLI
          </div>
        </div>

        {/* Video Player */}
        <div style={{
          flex: 1,
          position: 'relative',
          backgroundColor: '#000',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          {isLoading && (
            <div style={{
              position: 'absolute',
              color: 'white',
              fontSize: '18px',
              textAlign: 'center'
            }}>
              Yükleniyor...
            </div>
          )}
          {error && (
            <div style={{
              position: 'absolute',
              color: '#ef4444',
              fontSize: '16px',
              textAlign: 'center',
              backgroundColor: 'rgba(0,0,0,0.8)',
              padding: '16px 24px',
              borderRadius: '8px'
            }}>
              {error}
            </div>
          )}
          <video
            ref={videoRef}
            controls
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain'
            }}
          >
            Tarayıcınız video etiketini desteklemiyor.
          </video>
        </div>
      </div>
    </div>
  );
}

export default Spor;
