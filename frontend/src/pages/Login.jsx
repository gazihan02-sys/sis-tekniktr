import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [bgImage, setBgImage] = useState('https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=2072&auto=format&fit=crop');
  const [isBrightBackground, setIsBrightBackground] = useState(false);
  const navigate = useNavigate();

  const analyzeImageBrightness = (imageUrl) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const sampleSize = 48;
        canvas.width = sampleSize;
        canvas.height = sampleSize;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.drawImage(img, 0, 0, sampleSize, sampleSize);
        const imageData = ctx.getImageData(0, 0, sampleSize, sampleSize).data;

        let totalLuminance = 0;
        let pixelCount = 0;

        for (let i = 0; i < imageData.length; i += 4) {
          const r = imageData[i];
          const g = imageData[i + 1];
          const b = imageData[i + 2];

          const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          totalLuminance += luminance;
          pixelCount += 1;
        }

        const avgLuminance = totalLuminance / pixelCount;
        setIsBrightBackground(avgLuminance > 150);
      } catch {
        setIsBrightBackground(false);
      }
    };
    img.onerror = () => {
      setIsBrightBackground(false);
    };
    img.src = imageUrl;
  };

  useEffect(() => {
    // Fetch Bing's daily image
    const fetchBingImage = async () => {
      try {
        const response = await fetch('http://localhost:3000/api/bing/daily-image');
        if (!response.ok) {
          return;
        }

        const data = await response.json();
        const imageUrl = data?.image_url;
        if (!imageUrl) {
          return;
        }

        // Preload to ensure image is reachable before applying
        const preload = new Image();
        preload.onload = () => setBgImage(imageUrl);
        preload.onerror = () => {};
        preload.src = imageUrl;
      } catch (err) {
        console.error('Failed to fetch Bing image:', err);
      }
    };

    fetchBingImage();
  }, []);

  useEffect(() => {
    if (bgImage) {
      analyzeImageBrightness(bgImage);
    }
  }, [bgImage]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch('http://localhost:3000/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: username,
          password: password,
        }),
      });

      if (!response.ok) {
        setError('Hatalı kullanıcı adı veya şifre. Lütfen tekrar deneyin.');
        setPassword('');
        setLoading(false);
        return;
      }

      const data = await response.json();
      
      // Token'ı localStorage'a kaydet
      localStorage.setItem('token', data.token);
      localStorage.setItem('username', username);
      
      // Ana sayfaya yönlendir
      navigate('/');
    } catch (err) {
      setError('Bağlantı hatası. Lütfen daha sonra tekrar deneyin.');
      console.error('Login error:', err);
    }

    setLoading(false);
  };

  return (
    <div 
      className="min-h-screen flex items-center justify-start px-4 md:px-10 lg:px-16 relative bg-gray-900 overflow-hidden"
      style={{
        backgroundImage: bgImage ? `url(${bgImage})` : 'none',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat'
      }}
    >
      {/* Adaptive overlay based on image brightness */}
      <div className={`absolute inset-0 backdrop-blur-[1px] ${isBrightBackground ? 'bg-black/30' : 'bg-black/12'}`}></div>

      {/* Login Card - iPhone Style Liquid Glass */}
      <div className="relative w-full max-w-sm z-10">
        <div className={`rounded-[2.5rem] shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] overflow-hidden backdrop-blur-lg border relative ${isBrightBackground ? 'bg-black/35 border-white/25' : 'bg-white/12 border-white/20'}`}>
          
          {/* Subtle inner glow/reflection */}
          <div className={`absolute inset-0 pointer-events-none ${isBrightBackground ? 'bg-gradient-to-b from-white/10 to-transparent' : 'bg-gradient-to-b from-white/20 to-transparent'}`}></div>

          {/* Header */}
          <div className="px-8 pt-12 pb-6 text-center relative z-10">
            <div className="flex items-center justify-center mb-6">
              <div className="w-20 h-20 bg-white/20 rounded-3xl flex items-center justify-center shadow-inner backdrop-blur-md border border-white/30">
                <span className="material-icons text-4xl text-white drop-shadow-md">lock</span>
              </div>
            </div>
            <h1 className="text-3xl font-semibold text-white mb-1 tracking-tight drop-shadow-sm">Teknik Elektronik</h1>
            <p className="text-white/70 font-medium text-sm tracking-wide">Yönetim Paneli</p>
          </div>

          {/* Form */}
          <form onSubmit={handleLogin} className="px-8 pb-10 relative z-10">
            {/* Error Message */}
            {error && (
              <div className="mb-6 p-4 bg-red-500/20 border border-red-500/30 rounded-2xl flex items-start gap-3 backdrop-blur-md">
                <span className="material-icons text-red-200 text-xl flex-shrink-0 mt-0.5">error</span>
                <p className="text-red-100 text-sm font-medium">{error}</p>
              </div>
            )}

            {/* Username Input */}
            <div className="mb-5">
              <div className="relative group">
                <input
                  type="text"
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Kullanıcı Adı"
                  className={`w-full px-5 py-4 border rounded-2xl focus:outline-none focus:border-white/50 transition-all duration-300 text-white placeholder-white/60 font-medium ${isBrightBackground ? 'bg-black/35 border-white/15 focus:bg-black/45' : 'bg-black/20 border-white/10 focus:bg-black/30'}`}
                  disabled={loading}
                  autoFocus
                />
                <span className="absolute right-4 top-4 text-white/50 group-focus-within:text-white/80 transition-colors">
                  <span className="material-icons">person</span>
                </span>
              </div>
            </div>

            {/* Password Input */}
            <div className="mb-8">
              <div className="relative group">
                <input
                  type="password"
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Şifre"
                  className={`w-full px-5 py-4 border rounded-2xl focus:outline-none focus:border-white/50 transition-all duration-300 text-white placeholder-white/60 font-medium ${isBrightBackground ? 'bg-black/35 border-white/15 focus:bg-black/45' : 'bg-black/20 border-white/10 focus:bg-black/30'}`}
                  disabled={loading}
                />
                <span className="absolute right-4 top-4 text-white/50 group-focus-within:text-white/80 transition-colors">
                  <span className="material-icons">vpn_key</span>
                </span>
              </div>
            </div>

            {/* Login Button */}
            <button
              type="submit"
              disabled={loading || password.length === 0 || username.length === 0}
              className={`w-full text-white font-semibold py-4 px-4 rounded-2xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg ${isBrightBackground ? 'bg-white/28 hover:bg-white/35 border border-white/30' : 'bg-white/20 hover:bg-white/30 border border-white/20'}`}
            >
              {loading ? (
                <>
                  <span className="animate-spin">
                    <span className="material-icons">hourglass_empty</span>
                  </span>
                  <span>Giriş yapılıyor...</span>
                </>
              ) : (
                <>
                  <span>Giriş Yap</span>
                  <span className="material-icons text-sm">arrow_forward</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Bottom decorative element */}
        <div className="mt-8 text-center">
          <p className="text-white/60 text-xs font-medium tracking-wide flex items-center justify-center gap-1.5">
            <span className="material-icons text-sm">shield_lock</span>
            Güvenli Giriş Sistemi
          </p>
        </div>
      </div>
    </div>
  );
}
