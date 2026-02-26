import { useEffect, useState, createContext, useContext, useRef } from 'react'
import { initFlowbite } from 'flowbite'
import { BrowserRouter as Router, Routes, Route, Link, useLocation, useNavigate, useParams, Navigate } from 'react-router-dom'
import Login from './pages/Login'

// Create Theme Context
const ThemeContext = createContext();

const useTheme = () => useContext(ThemeContext);
const DATA_REFRESH_EVENT = 'sis:data-refresh';

let toastDispatcher = null;

const inferToastType = (message) => {
  const text = String(message || '').trim();
  if (text.startsWith('❌') || /^hata[:\s]/i.test(text) || /başarısız|yüklenemedi|oluştu/i.test(text)) {
    return 'error';
  }
  if (text.startsWith('✅') || /başarı|güncellendi|yüklendi/i.test(text)) {
    return 'success';
  }
  if (text.startsWith('⚠️') || /uyarı|dikkat|taşınamadı/i.test(text)) {
    return 'warning';
  }
  return 'info';
};

const showToast = (message, type) => {
  if (typeof toastDispatcher !== 'function') {
    console.log(message);
    return;
  }
  toastDispatcher(String(message || ''), type || inferToastType(message));
};

const BELGE_PLACEHOLDER = '__HAS_BELGE__';

const TURKISH_CHAR_MAP = {
  ç: 'c', Ç: 'c',
  ğ: 'g', Ğ: 'g',
  ı: 'i', İ: 'i',
  ö: 'o', Ö: 'o',
  ş: 's', Ş: 's',
  ü: 'u', Ü: 'u',
};

const normalizeFilenamePart = (value) => {
  const raw = String(value || 'dosya');
  const replaced = raw
    .split('')
    .map((char) => TURKISH_CHAR_MAP[char] ?? char)
    .join('')
    .toLowerCase();

  const normalized = replaced
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  return normalized || 'dosya';
};

const loadImageElement = (src) => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error('Resim yüklenemedi'));
  img.src = src;
});

const canvasToJpegBlob = (canvas, quality) => new Promise((resolve) => {
  canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality);
});

const compressImageUnderLimit = async (imageSrc, maxBytes = 300 * 1024) => {
  const image = await loadImageElement(imageSrc);
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  let bestBlob = null;
  const scales = [1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3];

  for (const scale of scales) {
    canvas.width = Math.max(1, Math.floor(image.width * scale));
    canvas.height = Math.max(1, Math.floor(image.height * scale));
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    for (const quality of [0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.15, 0.1]) {
      const blob = await canvasToJpegBlob(canvas, quality);
      if (!blob) continue;

      if (!bestBlob || blob.size < bestBlob.size) {
        bestBlob = blob;
      }

      if (blob.size <= maxBytes) {
        return blob;
      }
    }
  }

  if (!bestBlob || bestBlob.size > maxBytes) {
    throw new Error('Resim 300KB altına düşürülemedi');
  }

  return bestBlob;
};

const downloadBelgeAsCompressedJpg = async (selectedBelgeData) => {
  const typeMap = { F: 'fatura', G: 'garanti', Ü: 'uretim', A: 'ariza' };
  const namePart = normalizeFilenamePart(selectedBelgeData?.adi || 'musteri');
  const typePart = normalizeFilenamePart(typeMap[selectedBelgeData?.type] || 'belge');
  const filename = `${namePart}_${typePart}.jpg`;

  const blob = await compressImageUnderLimit(selectedBelgeData?.imageData, 300 * 1024);
  if (!blob) {
    throw new Error('Resim sıkıştırılamadı');
  }

  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
};

const triggerDataRefresh = () => {
  window.dispatchEvent(new Event(DATA_REFRESH_EVENT));
};

const confirmMathDelete = () => {
  const operators = ['+', '-'];
  const operator = operators[Math.floor(Math.random() * operators.length)];
  let a = Math.floor(Math.random() * 41) + 10;
  let b = Math.floor(Math.random() * 31) + 1;

  if (operator === '-' && b > a) {
    const tmp = a;
    a = b;
    b = tmp;
  }

  const expected = operator === '+' ? a + b : a - b;
  const input = window.prompt(`Silme onayı için işlemi çöz: ${a} ${operator} ${b} = ?`);

  if (input === null) {
    return false;
  }

  const answer = Number(String(input).trim());
  if (!Number.isFinite(answer) || answer !== expected) {
    window.alert('Matematik cevabı yanlış. Silme iptal edildi.');
    return false;
  }

  return true;
};

const isSameData = (a, b) => {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
};

function useDataRefreshListener(callback, deps = []) {
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    const onDataRefresh = () => {
      callbackRef.current();
    };

    window.addEventListener(DATA_REFRESH_EVENT, onDataRefresh);
    return () => window.removeEventListener(DATA_REFRESH_EVENT, onDataRefresh);
  }, deps);
}

// Menu Item Component - Normal menu items
function MenuItem({ to, iconName, label, children, themeColor, isLogout }) {
  const location = useLocation();
  const isActive = location.pathname.startsWith(to) && to !== '/';
  const [isOpen, setIsOpen] = useState(false);
  
  const getIconColor = (isActive) => {
    if (isActive) return 'white';
    if (isLogout) return '#ef4444';
    return '#4B5563';
  };
  
  if (children) {
    return (
      <li>
        <button 
          onClick={() => setIsOpen(!isOpen)}
          className={`flex flex-col items-center justify-center w-full p-2 rounded-lg group text-center transition`}
          style={isOpen ? { backgroundColor: themeColor, color: 'white' } : { color: '#4B5563' }}
        >
          <span className="material-icons text-xl block mx-auto mb-0.5" style={{ color: getIconColor(isOpen) }}>
            {iconName}
          </span>
          <span className="whitespace-nowrap font-medium text-xs leading-tight">{label}</span>
          <span className={`material-icons transition-transform text-xs mt-0.5`} style={{ color: getIconColor(isOpen) }}>chevron_down</span>
        </button>
        {isOpen && (
          <ul className="space-y-1 mt-2 bg-gray-50 rounded-lg p-2">
            {children}
          </ul>
        )}
      </li>
    );
  }
  
  return (
    <li>
       <Link 
         to={to} 
         className={`flex flex-col items-center justify-center w-full p-2 rounded-lg group text-center transition`}
         style={isActive ? { backgroundColor: themeColor, color: 'white' } : { color: '#4B5563' }}
       >
         <span className="material-icons text-xl block mx-auto mb-0.5" style={{ color: getIconColor(isActive) }}>
           {iconName}
         </span>
          <span className="whitespace-nowrap font-medium text-xs leading-tight">{label}</span>
       </Link>
    </li>
  );
}

// Sub Menu Item Component
function SubMenuItem({ to, label }) {
  const location = useLocation();
  const isActive = location.pathname === to;
  
  return (
    <li>
       <Link to={to} className={`flex items-center p-2 text-sm rounded-lg ${isActive ? 'bg-blue-200 text-blue-900 font-medium border-l-2 border-blue-600' : 'text-gray-700 hover:bg-blue-50'}`}>
          <span className="ms-3">{label}</span>
       </Link>
    </li>
  );
}

// Logout Component
function Logout() {
  const navigate = useNavigate();
  
  useEffect(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    localStorage.removeItem('level');
    navigate('/login', { replace: true });
  }, [navigate]);
  
  return null;
}

// Private Route Component - Check if user is authenticated
function PrivateRoute({ children }) {
  const location = useLocation();
  const isAuthenticated = !!localStorage.getItem('token');
  const userLevel = (localStorage.getItem('level') || '').trim().toLowerCase();
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (userLevel === 'level3' && location.pathname !== '/cihaz_kurulum') {
    return <Navigate to="/cihaz_kurulum" replace />;
  }
  
  return children;
}

// Page Components
function Home() {
  const { themeColor } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [successMessage, setSuccessMessage] = useState(location.state?.successMessage || null);
  const [stats, setStats] = useState({});
  const [searchText, setSearchText] = useState('');
  const [searchPlaceholder, setSearchPlaceholder] = useState('Hoş Geldin Usta');
  const [allCustomers, setAllCustomers] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const homeCacheRef = useRef({ stats: null, customers: null });

  const formatDisplayName = (value) => {
    return String(value || '')
      .trim()
      .toLocaleLowerCase('tr-TR')
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toLocaleUpperCase('tr-TR') + part.slice(1))
      .join(' ');
  };
  
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);
  
  useEffect(() => {
    const currentUsername = (localStorage.getItem('username') || '').trim().toLocaleLowerCase('tr-TR');

    if (!currentUsername) {
      setSearchPlaceholder('Hoş Geldin Usta');
      return;
    }

    const quickName = formatDisplayName(currentUsername);
    setSearchPlaceholder(`Hoş Geldin ${quickName} Usta`);

    fetch('/api/users')
      .then(res => res.json())
      .then(users => {
        if (!Array.isArray(users)) return;
        const currentUser = users.find(
          (user) => (user?.username || '').toLocaleLowerCase('tr-TR') === currentUsername
        );
        const displayName = formatDisplayName(currentUser?.ad_soyad || currentUser?.username || currentUsername);
        if (displayName) {
          setSearchPlaceholder(`Hoş Geldin ${displayName} Usta`);
        }
      })
      .catch(err => console.error('User placeholder fetch error:', err));
  }, []);

  const fetchHomeData = async () => {
    let hasChanged = false;
    try {
      const [statsResponse, customersResponse] = await Promise.all([
        fetch('/api/musteri-kabul/stats'),
        fetch('/api/musteri-kabul')
      ]);

      if (statsResponse.ok) {
        const statsData = await statsResponse.json();
        if (!isSameData(homeCacheRef.current.stats, statsData)) {
          homeCacheRef.current.stats = statsData;
          setStats(statsData);
          hasChanged = true;
        }
      }

      if (customersResponse.ok) {
        const customersData = await customersResponse.json();
        const normalizedCustomers = Array.isArray(customersData) ? customersData : [];
        if (!isSameData(homeCacheRef.current.customers, normalizedCustomers)) {
          homeCacheRef.current.customers = normalizedCustomers;
          setAllCustomers(normalizedCustomers);
          hasChanged = true;
        }
      }
    } catch (err) {
      console.error('Home live data fetch error:', err);
    }
    return hasChanged;
  };

  useEffect(() => {
    fetchHomeData();
  }, []);
  useDataRefreshListener(fetchHomeData, []);

  // Handle search
  useEffect(() => {
    if (searchText.trim() === '') {
      setSearchResults([]);
    } else {
      const query = searchText.toLowerCase();
      const filtered = allCustomers.filter(customer =>
        customer.ad_soyad?.toLowerCase().includes(query) ||
        customer.telefon?.toLowerCase().includes(query) ||
        customer.marka_model?.toLowerCase().includes(query)
      );
      setSearchResults(filtered);
    }
  }, [searchText, allCustomers]);
  
  const handleCardClick = (statusId) => {
    navigate(`/status/${statusId}`);
  };

  const handleSearchResultClick = (customerId) => {
    navigate(`/edit/${customerId}`);
  };

  const getStatusDisplayName = (status) => {
    const statusNameMap = {
      'MÜŞTERI_KABUL': 'Müşteri Kabul',
      'MÜŞTERİ_KABUL': 'Müşteri Kabul',
      'MUSTERI_KABUL': 'Müşteri Kabul',
      'TEKNISYENE_VERİLDİ': 'Teknisyene Verildi',
      'TEKNISYENE_VERILDI': 'Teknisyene Verildi',
      'İŞLEM_BEKLİYOR': 'İşlem Bekliyor',
      'ISLEM_BEKLIYOR': 'İşlem Bekliyor',
      'PARÇA_BEKLİYOR': 'Parça Bekliyor',
      'PARCA_BEKLIYOR': 'Parça Bekliyor',
      'MERKEZE_SEVK': 'Merkeze Sevk',
      'DEĞİŞİM': 'Değişim',
      'DEGISIM': 'Değişim',
      'TAMİR_TAMAMLANDI': 'Tamir Tamamlandı',
      'TAMIR_TAMAMLANDI': 'Tamir Tamamlandı',
      'TESLİM_EDİLDİ': 'Teslim Edildi',
      'TESLIM_EDILDI': 'Teslim Edildi',
      'İADE': 'İade',
      'IADE': 'İade',
    };

    return statusNameMap[status] || 'Durum Yok';
  };

  const getDaysSinceCreated = (createdAt) => {
    if (!createdAt) return null;
    const createdDate = new Date(createdAt);
    if (Number.isNaN(createdDate.getTime())) return null;

    const now = new Date();
    const diffMs = now.getTime() - createdDate.getTime();
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    return days < 0 ? 0 : days;
  };
  
  const statusCards = [
    { id: 1, label: 'Müşteri Kabul', icon: 'engineering', statusId: 1 },
    { id: 2, label: 'Teknisyene Verildi', icon: 'schedule', statusId: 2 },
    { id: 3, label: 'İşlem Bekliyor', icon: 'inventory_2', statusId: 3 },
    { id: 4, label: 'Parça Bekliyor', icon: 'local_shipping', statusId: 4 },
    { id: 5, label: 'Merkeze Sevk', icon: 'swap_horiz', statusId: 5 },
    { id: 6, label: 'Değişim', icon: 'check_circle', statusId: 6 },
    { id: 7, label: 'Tamir Tamamlandı', icon: 'done_all', statusId: 7 },
    { id: 8, label: 'Teslim Edildi', icon: 'undo', statusId: 8 },
    { id: 9, label: 'İade', icon: 'reply_all', statusId: 9 }
  ];
  
  return (
    <div className="p-4">
       {successMessage && (
         <div className="mb-6 p-4 bg-green-50 border-l-4 border-green-500 rounded shadow-sm">
           <div className="flex justify-between items-start">
             <div className="flex-1">
               <p className="text-green-800 font-bold whitespace-pre-wrap">{successMessage}</p>
             </div>
             <button 
               onClick={() => setSuccessMessage(null)}
               className="text-green-600 hover:text-green-800 ml-4"
             >
               ✕
             </button>
           </div>
        </div>
      )}

       {/* Search Bar */}
       <div className="mb-8">
         <div className="relative">
           <div className="absolute left-4 top-1/2 transform -translate-y-1/2 flex items-center gap-2 pointer-events-none">
             <span className="material-icons text-gray-400">search</span>
           </div>
           <input
             type="text"
             placeholder={searchPlaceholder}
             value={searchText}
             onChange={(e) => setSearchText(e.target.value)}
             className="w-full pl-12 pr-10 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 text-sm"
             style={{ '--tw-ring-color': themeColor }}
           />
           {searchText && (
             <button
               onClick={() => setSearchText('')}
               className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition"
             >
               <span className="material-icons text-lg">close</span>
             </button>
           )}

           {/* Search Results */}
           {searchText && searchResults.length > 0 && (
             <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-80 overflow-y-auto z-40">
               {searchResults.map((customer) => (
                 <div
                   key={customer.id}
                   onClick={() => {
                     handleSearchResultClick(customer.id);
                     setSearchText('');
                   }}
                   className="p-3 border-b border-gray-100 hover:bg-blue-50 cursor-pointer transition"
                 >
                   <div className="font-medium text-gray-800 text-sm">{customer.ad_soyad}</div>
                   <div className="flex gap-4 mt-1">
                     <span className="text-xs text-gray-500">{customer.telefon || '-'}</span>
                     <span className="text-xs text-gray-400">{customer.marka_model || '-'}</span>
                   </div>
                   <div className="text-xs text-blue-700 mt-1 font-medium flex items-center gap-1">
                     <span>&gt; {getStatusDisplayName(customer.status)}</span>
                     {getDaysSinceCreated(customer.created_at) !== null && (
                       <span className="text-[10px] text-red-600 font-semibold">{getDaysSinceCreated(customer.created_at)} gün</span>
                     )}
                   </div>
                 </div>
               ))}
             </div>
           )}

           {/* No Results */}
           {searchText && searchResults.length === 0 && (
             <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-4 z-40">
               <p className="text-gray-500 text-center text-sm">Müşteri bulunamadı</p>
             </div>
           )}
         </div>
       </div>
       
       <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
         {statusCards.map((card) => (
           <div 
             key={card.id}
             onClick={() => handleCardClick(card.statusId)}
             className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
             style={{ borderLeftColor: themeColor, borderLeftWidth: '4px' }}
           >
             <div className="flex items-center justify-between mb-2">
               <span className="material-icons text-2xl" style={{ color: themeColor }}>
                 {card.icon}
               </span>
             </div>
             <p className="text-sm font-medium text-gray-600 mb-2">{card.label}</p>
             <p className="text-2xl font-bold" style={{ color: themeColor }}>{stats[card.statusId] ?? '-'}</p>
           </div>
         ))}
       </div>
    </div>
  );
}

function StatusList({showBelgeModal, setShowBelgeModal, selectedBelgeData, setSelectedBelgeData}) {
  const { themeColor } = useTheme();
  const navigate = useNavigate();
  const { status } = useParams();
  const currentStatusId = Number(status);
  const [statusList, setStatusList] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState([]);
  const [targetStatusId, setTargetStatusId] = useState('');
  const [isBulkMoving, setIsBulkMoving] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [showBulkActions, setShowBulkActions] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const statusListCacheRef = useRef(null);
  const hasLoadedOnceRef = useRef(false);
  const pageSize = 10;
  const [editForm, setEditForm] = useState({
    ad_soyad: '',
    telefon: '',
    marka_model: '',
    aksesuarlar: '',
    musteri_sikayeti: '',
    not: '',
    teknisyen_aciklamasi: '',
    status: ''
  });

  const statusMap = {
    1: 'Müşteri Kabul',
    2: 'Teknisyene Verildi',
    3: 'İşlem Bekliyor',
    4: 'Parça Bekliyor',
    5: 'Merkeze Sevk',
    6: 'Değişim',
    7: 'Tamir Tamamlandı',
    8: 'Teslim Edildi',
    9: 'İade'
  };

  const getStatusLabel = (statusId) => statusMap[statusId] || `Status ${statusId}`;
  const allVisibleSelected = statusList.length > 0 && selectedIds.length === statusList.length;
  const pageButtons = [
    currentPage > 1 ? currentPage - 1 : null,
    currentPage,
    hasNextPage ? currentPage + 1 : null,
  ].filter((value, index, arr) => value !== null && arr.indexOf(value) === index);

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelectedIds([]);
      return;
    }
    setSelectedIds(statusList.map((item) => item.id));
  };

  const toggleSingleSelect = (id) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((selectedId) => selectedId !== id);
      }
      return [...prev, id];
    });
  };

  const handleBulkStatusMove = async () => {
    if (selectedIds.length === 0) {
      alert('Lütfen en az 1 kayıt seçin');
      return;
    }

    const targetId = Number(targetStatusId);
    if (!targetId || targetId === currentStatusId) {
      alert('Lütfen geçerli bir hedef statü seçin');
      return;
    }

    if (!window.confirm(`${selectedIds.length} kayıt ${getStatusLabel(targetId)} statüsüne taşınacak. Emin misiniz?`)) {
      return;
    }

    setIsBulkMoving(true);

    try {
      const updateResults = await Promise.all(
        selectedIds.map(async (id) => {
          const response = await fetch(`/api/musteri-kabul/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: targetId })
          });

          return {
            id,
            ok: response.ok || response.status === 204
          };
        })
      );

      const failedCount = updateResults.filter((result) => !result.ok).length;
      const successCount = updateResults.length - failedCount;

      if (failedCount > 0) {
        alert(`⚠️ ${successCount} kayıt taşındı, ${failedCount} kayıt taşınamadı.`);
      } else {
        alert(`✅ ${successCount} kayıt ${getStatusLabel(targetId)} statüsüne taşındı.`);
      }

      setSelectedIds([]);
      setTargetStatusId('');
      await fetchStatusList();
      triggerDataRefresh();
    } catch (error) {
      console.error('Bulk status move error:', error);
      alert('❌ Toplu taşıma sırasında hata oluştu: ' + error.message);
    } finally {
      setIsBulkMoving(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) {
      alert('Lütfen en az 1 kayıt seçin');
      return;
    }

    if (!window.confirm(`${selectedIds.length} kayıt toplu silinecek. Emin misiniz?`)) {
      return;
    }

    if (!confirmMathDelete()) {
      return;
    }

    setIsBulkDeleting(true);

    let deletedCount = 0;
    let failedCount = 0;

    try {
      for (const id of selectedIds) {
        try {
          const response = await fetch(`/api/musteri-kabul/${id}`, {
            method: 'DELETE',
          });

          if (response.ok || response.status === 204) {
            deletedCount += 1;
          } else {
            failedCount += 1;
          }
        } catch {
          failedCount += 1;
        }
      }

      await fetchStatusList();
      triggerDataRefresh();
      setSelectedIds([]);
      alert(`Toplu silme tamamlandı. Başarılı: ${deletedCount}, Hatalı: ${failedCount}`);
    } catch (error) {
      console.error('Bulk delete error:', error);
      alert('Toplu silme sırasında hata oluştu: ' + error.message);
    } finally {
      setIsBulkDeleting(false);
    }
  };

  // Convert status string (from DB) to numeric ID
  const statusStringToId = (statusStr) => {
    const statusIds = {
      'MÜŞTERI_KABUL': 1,
      'TEKNISYENE_VERİLDİ': 2,
      'İŞLEM_BEKLİYOR': 3,
      'PARÇA_BEKLİYOR': 4,
      'MERKEZE_SEVK': 5,
      'DEĞİŞİM': 6,
      'TAMİR_TAMAMLANDI': 7,
      'TESLİM_EDİLDİ': 8,
      'İADE': 9
    };
    return statusIds[statusStr] || '';
  };

  const handleEdit = (item) => {
    navigate(`/edit/${item.id}`);
  };

  const handleBelgePreview = async (item, letter, field) => {
    if (!item[field]) {
      setSelectedBelgeData({ imageData: null, type: letter, adi: item.ad_soyad, customerId: item.id });
      setShowBelgeModal(true);
      return;
    }

    let imageData = item[field];

    if (imageData === BELGE_PLACEHOLDER) {
      try {
        const response = await fetch(`/api/musteri-kabul/${item.id}`);
        if (response.ok) {
          const detail = await response.json();
          imageData = detail?.[field] || null;
        }
      } catch (error) {
        console.error('Belge detay fetch error:', error);
      }
    }

    setSelectedBelgeData({ imageData, type: letter, adi: item.ad_soyad, customerId: item.id });
    setShowBelgeModal(true);
  };

  const fetchStatusList = async () => {
    if (!hasLoadedOnceRef.current) {
      setIsLoading(true);
    }

    let hasChanged = false;
    try {
      const response = await fetch(`/api/musteri-kabul/by-status/${status}?page=${currentPage}&page_size=${pageSize}`);
      const data = await response.json();
      const normalizedData = Array.isArray(data) ? data : [];
      setHasNextPage(normalizedData.length === pageSize);
      if (!isSameData(statusListCacheRef.current, normalizedData)) {
        statusListCacheRef.current = normalizedData;
        setStatusList(normalizedData);
        hasChanged = true;
      }
    } catch (err) {
      console.error('List fetch error:', err);
    } finally {
      hasLoadedOnceRef.current = true;
      setIsLoading(false);
    }
    return hasChanged;
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editForm.ad_soyad.trim()) {
      alert('Adı soyadı boş olamaz');
      return;
    }

    try {
      console.log('🔄 Update isteği gönderiliyor:', {
        id: editingItem.id,
        formData: editForm
      });

      const response = await fetch(`/api/musteri-kabul/${editingItem.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm)
      });

      console.log('✅ Update response status:', response.status, response.statusText);

      if (response.ok || response.status === 204) {
        console.log('📝 Update başarılı, liste güncelleniyor...');
        setShowEditModal(false);
        setEditingItem(null);
        alert('✅ Güncellendi');

        await fetchStatusList();
        triggerDataRefresh();
      } else {
        const errorText = await response.text();
        console.error('❌ Update failed:', response.status, errorText);
        alert('❌ Güncelleme başarısız: ' + response.statusText);
      }
    } catch (error) {
      console.error('❌ Edit error:', error);
      alert('❌ Hata: ' + error.message);
    }
  };

  const handleDelete = async (id, name) => {
    // Silmeden önce onay iste
    if (!window.confirm(`${name} silinecek. Emin misiniz?`)) {
      return;
    }

    if (!confirmMathDelete()) {
      return;
    }

    try {
      console.log('DELETE isteği gönderiliyor:', id);
      const response = await fetch(`/api/musteri-kabul/${id}`, {
        method: 'DELETE',
      });

      console.log('DELETE response status:', response.status, response.statusText);

      if (response.ok || response.status === 204) {
        // Listeden kaldır
        setStatusList((prev) => prev.filter(item => item.id !== id));
        triggerDataRefresh();
        console.log('Müşteri silindi:', name);
      } else {
        try {
          const error = await response.json();
          console.error('Server error:', error);
          alert('Hata: ' + (error.message || 'Müşteri silinemedi'));
        } catch {
          console.error('Response status:', response.status, 'statusText:', response.statusText);
          alert('Hata: ' + response.statusText);
        }
      }
    } catch (error) {
      console.error('Fetch error:', error);
      alert('Bağlantı Hatası: ' + error.message);
    }
  };

  const handlePrintRepairSlip = (item) => {
    const now = new Date();
    const createdAt = item.created_at
      ? new Date(item.created_at)
      : now;

    const params = new URLSearchParams({
      ad_soyad: item.ad_soyad || '-',
      telefon: item.telefon || '-',
      model: item.marka_model || '-',
      ariza: item.musteri_sikayeti || '-',
      tarih: `${createdAt.toLocaleDateString('tr-TR')}`,
    });

    const printUrl = `/repair-slip.html?${params.toString()}`;
    const printWindow = window.open(printUrl, '_blank', 'width=420,height=520');

    if (!printWindow) {
      alert('Yazdırma sayfası açılamadı. Tarayıcı popup engelini kaldırın.');
    }
  };
  
  useEffect(() => {
    fetchStatusList();
  }, [status, currentPage]);

  useEffect(() => {
    setSelectedIds((prev) => prev.filter((id) => statusList.some((item) => item.id === id)));
  }, [statusList]);

  useEffect(() => {
    setSelectedIds([]);
    setTargetStatusId('');
    setShowBulkActions(false);
    setCurrentPage(1);
  }, [status]);

  useDataRefreshListener(fetchStatusList, [status, currentPage]);
  
  return (
    <div className="p-4">
      <div className="flex items-center gap-3 mb-6">
        <button 
          onClick={() => navigate('/')}
          className="material-icons text-2xl text-gray-600 hover:text-gray-800 cursor-pointer"
        >
          arrow_back
        </button>
        <h2 className="text-3xl font-bold">{getStatusLabel(status)}</h2>
      </div>
      
      {isLoading ? (
        <p className="text-center text-gray-500">Yükleniyor...</p>
      ) : statusList.length === 0 ? (
        <p className="text-center text-gray-500">Kayıt bulunamadı</p>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden md:block relative overflow-x-auto bg-gray-50 shadow-sm rounded-lg border border-gray-200">
            <table className="w-full text-sm text-left text-gray-700">
              <thead className="text-sm font-semibold text-gray-900 border-b border-gray-200" style={{ backgroundColor: `${themeColor}12` }}>
                <tr>
                  <th scope="col" className="px-3 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleSelectAll}
                      className="w-4 h-4"
                    />
                  </th>
                  <th scope="col" className="px-6 py-3">İsim</th>
                  <th scope="col" className="px-6 py-3">Telefon</th>
                  <th scope="col" className="px-6 py-3">Cihaz Modeli</th>
                  <th scope="col" className="px-6 py-3">Belgeler</th>
                  <th scope="col" className="px-6 py-3 text-center">İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {statusList.map((item) => (
                  <tr key={item.id} className="bg-white border-b border-gray-200 hover:bg-gray-50 transition">
                    <td className="px-3 py-4 text-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(item.id)}
                        onChange={() => toggleSingleSelect(item.id)}
                        className="w-4 h-4"
                      />
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="font-medium">{item.ad_soyad}</div>
                        {item.fiyat_verilecek && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-700 animate-pulse">
                            Fiyat Verilecek
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {new Date(item.created_at).toLocaleDateString('tr-TR')} {new Date(item.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>
                    <td className="px-6 py-4">{item.telefon || '-'}</td>
                    <td className="px-6 py-4">{item.marka_model || '-'}</td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2">
                        {[['F', 'belge_f'], ['G', 'belge_g'], ['Ü', 'belge_u'], ['A', 'belge_a']].map(([letter, field]) => {
                          const hasBelge = item[field] ? true : false;
                          const handleBelgeClick = () => handleBelgePreview(item, letter, field);
                          return (
                            <div 
                              key={letter}
                              className={`w-8 h-8 rounded-lg flex items-center justify-center font-semibold text-xs border-2 cursor-pointer transition ${hasBelge ? 'text-white' : ''}`}
                              style={{ 
                                borderColor: themeColor,
                                borderStyle: hasBelge ? 'solid' : 'dashed',
                                backgroundColor: hasBelge ? themeColor : 'transparent',
                                color: hasBelge ? 'white' : themeColor
                              }}
                              onClick={handleBelgeClick}
                              title={hasBelge ? `${letter} belgesi - Tıkla` : `${letter} belgesi - Boş`}
                            >
                              {letter}
                            </div>
                          );
                        })}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center space-x-3 flex justify-center">
                      <button onClick={() => handleEdit(item)} className="text-blue-600 hover:text-blue-800 hover:bg-blue-50 transition border border-blue-300 rounded-lg p-2 flex items-center justify-center" title="Düzenle">
                        <span className="material-icons">edit</span>
                      </button>
                      <button onClick={() => handlePrintRepairSlip(item)} className="text-green-600 hover:text-green-800 hover:bg-green-50 transition border border-green-300 rounded-lg p-2 flex items-center justify-center" title="Tamir Fişi Yazdır">
                        <span className="material-icons">print</span>
                      </button>
                      <button className="text-red-600 hover:text-red-800 hover:bg-red-50 transition border border-red-300 rounded-lg p-2 flex items-center justify-center" title="Sil" onClick={() => handleDelete(item.id, item.ad_soyad)}>
                        <span className="material-icons">delete</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden space-y-4">
            {statusList.map((item) => (
              <div key={item.id} className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-gray-900">{item.ad_soyad}</h3>
                    {item.fiyat_verilecek && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-700 animate-pulse">
                        Fiyat Verilecek
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {new Date(item.created_at).toLocaleDateString('tr-TR')} {new Date(item.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(item.id)}
                    onChange={() => toggleSingleSelect(item.id)}
                    className="w-5 h-5 mt-1"
                  />
                </div>
                
                <div className="space-y-2 mb-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Telefon:</span>
                    <span className="font-medium">{item.telefon || '-'}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Cihaz:</span>
                    <span className="font-medium">{item.marka_model || '-'}</span>
                  </div>
                </div>

                <div className="border-t border-gray-200 pt-4 mb-4">
                  <p className="text-xs text-gray-600 mb-2 text-center">Belgeler:</p>
                  <div className="flex gap-2 justify-center">
                    {[['F', 'belge_f'], ['G', 'belge_g'], ['Ü', 'belge_u'], ['A', 'belge_a']].map(([letter, field]) => {
                      const hasBelge = item[field] ? true : false;
                      const handleBelgeClick = () => handleBelgePreview(item, letter, field);
                      return (
                        <div 
                          key={letter}
                          className={`w-10 h-10 rounded-lg flex items-center justify-center font-semibold text-sm border-2 cursor-pointer transition ${hasBelge ? 'text-white' : ''}`}
                          style={{ 
                            borderColor: themeColor,
                            borderStyle: hasBelge ? 'solid' : 'dashed',
                            backgroundColor: hasBelge ? themeColor : 'transparent',
                            color: hasBelge ? 'white' : themeColor
                          }}
                          onClick={handleBelgeClick}
                          title={hasBelge ? `${letter} belgesi - Tıkla` : `${letter} belgesi - Boş`}
                        >
                          {letter}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="border-t border-gray-200 pt-4 flex gap-2 justify-center">
                  <button onClick={() => handleEdit(item)} className="flex-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 transition border border-blue-300 rounded-lg p-2 flex items-center justify-center" title="Düzenle">
                    <span className="material-icons">edit</span>
                  </button>
                  <button onClick={() => handlePrintRepairSlip(item)} className="flex-1 text-green-600 hover:text-green-800 hover:bg-green-50 transition border border-green-300 rounded-lg p-2 flex items-center justify-center" title="Tamir Fişi Yazdır">
                    <span className="material-icons">print</span>
                  </button>
                  <button className="flex-1 text-red-600 hover:text-red-800 hover:bg-red-50 transition border border-red-300 rounded-lg p-2 flex items-center justify-center" title="Sil" onClick={() => handleDelete(item.id, item.ad_soyad)}>
                    <span className="material-icons">delete</span>
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Toplu İşlemler - Bottom */}
          <div className="mb-4 flex flex-col items-start gap-2 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowBulkActions((prev) => !prev)}
              className="px-4 py-2 text-sm font-medium border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition shrink-0"
            >
              Toplu İşlemler
            </button>

            <div
              className={`w-full transition-all duration-300 ease-out transform origin-top bg-white border border-gray-200 rounded-lg p-3 ${showBulkActions ? 'opacity-100 translate-y-0 max-h-96' : 'opacity-0 -translate-y-1 max-h-0 p-0 border-transparent pointer-events-none'}`}
            >
              <div className="flex flex-col md:flex-row md:items-center gap-3">
                <div className="text-sm font-medium text-gray-700">
                  {selectedIds.length} kayıt seçildi
                </div>
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition"
                >
                  {allVisibleSelected ? 'Seçimi Temizle' : 'Tümünü Seç'}
                </button>
                <div className="flex-1" />
                <select
                  value={targetStatusId}
                  onChange={(e) => setTargetStatusId(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm min-w-56"
                >
                  <option value="">Hedef statü seçin</option>
                  {Object.entries(statusMap)
                    .filter(([id]) => Number(id) !== currentStatusId)
                    .map(([id, label]) => (
                      <option key={id} value={id}>{label}</option>
                    ))}
                </select>
                <button
                  type="button"
                  onClick={handleBulkStatusMove}
                  disabled={selectedIds.length === 0 || !targetStatusId || isBulkMoving}
                  className="px-4 py-2 text-white rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ backgroundColor: themeColor }}
                >
                  {isBulkMoving ? 'Taşınıyor...' : 'Seçilenleri Taşı'}
                </button>
                <button
                  type="button"
                  onClick={handleBulkDelete}
                  disabled={selectedIds.length === 0 || isBulkDeleting}
                  className="px-4 py-2 rounded-lg text-sm font-medium border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isBulkDeleting ? 'Siliniyor...' : 'Toplu Sil'}
                </button>
              </div>
            </div>
          </div>

          <div className="mb-4 flex items-center justify-between gap-2">
            <div className="text-xs text-gray-600">Sayfa {currentPage}</div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Önceki
              </button>
              {pageButtons.map((pageNo) => {
                const isActive = pageNo === currentPage;
                return (
                  <button
                    key={pageNo}
                    type="button"
                    onClick={() => setCurrentPage(pageNo)}
                    className={`w-9 h-9 text-sm border rounded-lg transition ${isActive ? 'text-white' : 'border-gray-300 hover:bg-gray-50 text-gray-700'}`}
                    style={isActive ? { backgroundColor: themeColor, borderColor: themeColor } : undefined}
                  >
                    {pageNo}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setCurrentPage((prev) => prev + 1)}
                disabled={!hasNextPage}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Sonraki
              </button>
            </div>
          </div>
        </>
      )}

      {/* Edit Modal */}
      {/* Edit modal removed - now using /edit/:customerId route */}
    </div>
  );
}

{/* MusteriKabul - Müşteri Ekleme Formu */}
function MusteriKabul({showBelgeModal, setShowBelgeModal, selectedBelgeData, setSelectedBelgeData}) {
  const { themeColor } = useTheme();
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    adSoyad: '',
    telefon: '',
    markaModel: '',
    aksesuarlar: '',
    museriSikayeti: '',
    not: '',
    belge_f: null,
    belge_g: null,
    belge_u: null,
    belge_a: null
  });
  const [belgeBase64, setBelgeBase64] = useState({
    belge_f: null,
    belge_g: null,
    belge_u: null,
    belge_a: null
  });
  const [isLoading, setIsLoading] = useState(false);
  const [submitMessage, setSubmitMessage] = useState(null);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value.toLocaleUpperCase('tr-TR')
    }));
  };

  const [isCompressing, setIsCompressing] = useState(false);

  const handleFileChange = (e) => {
    const { name } = e.target;
    const file = e.target.files[0];
    console.log('📁 File selected:', { 
      name, 
      fileName: file?.name, 
      fileSize: file?.size, 
      fileType: file?.type 
    });
    
    // Resmi compress etmek için canvas kullan
    if (file && file.type.startsWith('image/')) {
      setIsCompressing(true);
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          // Yüksekliği 1200px'ye sınırla, genişliği orantılı yap
          let width = img.width;
          let height = img.height;
          if (height > 1200) {
            width = Math.round((width * 1200) / height);
            height = 1200;
          }
          
          canvas.width = width;
          canvas.height = height;
          ctx.drawImage(img, 0, 0, width, height);
          
          // JPEG olarak 0.8 kalitesiyle compress et
          canvas.toBlob((blob) => {
            console.log('📸 Image compressed:', { 
              original: file.size, 
              compressed: blob.size, 
              ratio: Math.round((blob.size / file.size) * 100) + '%'
            });
            const compressedFile = new File([blob], file.name, { type: 'image/jpeg' });
            setFormData(prev => ({
              ...prev,
              [name]: compressedFile
            }));
            
            // Store base64 for display in modal/badges
            const base64Reader = new FileReader();
            base64Reader.onload = (e) => {
              setBelgeBase64(prev => ({
                ...prev,
                [name]: e.target.result
              }));
            };
            base64Reader.readAsDataURL(blob);
            
            setIsCompressing(false);
            console.log(`✅ ${name} compression complete`);
          }, 'image/jpeg', 0.8);
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    } else {
      // Eğer resim değilse direkt ekle
      setFormData(prev => ({
        ...prev,
        [name]: file
      }));
      setIsCompressing(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Compression bitene kadar bekle
    if (isCompressing) {
      alert('Lütfen resim compression bitene kadar bekleyin...');
      return;
    }
    
    setIsLoading(true);
    setSubmitMessage(null);

    try {
      // Belgeler için base64 dönüştürme
      const convertFileToBase64 = (file) => {
        return new Promise((resolve) => {
          if (!file) {
            resolve(null);
            return;
          }
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.readAsDataURL(file);
        });
      };

      const belge_f = await convertFileToBase64(formData.belge_f);
      const belge_g = await convertFileToBase64(formData.belge_g);
      const belge_u = await convertFileToBase64(formData.belge_u);
      const belge_a = await convertFileToBase64(formData.belge_a);

      const payload = {
        ad_soyad: formData.adSoyad,
        telefon: formData.telefon,
        marka_model: formData.markaModel,
        aksesuarlar: formData.aksesuarlar,
        musteri_sikayeti: formData.museriSikayeti,
        not: formData.not || null,
        belge_f: belge_f,
        belge_g: belge_g,
        belge_u: belge_u,
        belge_a: belge_a
      };

      console.log('Form Payload:', {
        ...payload,
        belge_f: belge_f ? belge_f.substring(0, 50) + '...' : 'null',
        belge_g: belge_g ? belge_g.substring(0, 50) + '...' : 'null',
        belge_u: belge_u ? belge_u.substring(0, 50) + '...' : 'null',
        belge_a: belge_a ? belge_a.substring(0, 50) + '...' : 'null'
      });

      const response = await fetch('/api/musteri-kabul', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const result = await response.json();
        const successMsg = `✅ ${result.ad_soyad} - Müşteri başarıyla kaydedildi.\n\n📱 Fatura yükleme linki SMS ile gönderildi.`;
        triggerDataRefresh();
        navigate('/', { state: { successMessage: successMsg } });
      } else {
        const error = await response.json();
        setSubmitMessage({
          type: 'error',
          title: 'Hata',
          message: error.message || 'Form gönderilemedi'
        });
      }
    } catch (error) {
      setSubmitMessage({
        type: 'error',
        title: 'Bağlantı Hatası',
        message: `Backend bağlantısı başarısız: ${error.message}`
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-4 flex items-start justify-center min-h-screen bg-gray-50">
       <div className="w-full max-w-6xl">
         <div className="flex items-center justify-between mb-6">
           <h2 className="text-2xl font-bold" style={{ color: themeColor }}>Müşteri Kabul</h2>
           <div className="flex gap-1.5">
             {[['F', 'belge_f'], ['G', 'belge_g'], ['Ü', 'belge_u'], ['A', 'belge_a']].map(([label, fieldName]) => (
               <div
                 key={fieldName}
                 className="relative w-9 h-9 rounded-full border flex items-center justify-center overflow-hidden shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                 style={{ borderColor: belgeBase64[fieldName] ? themeColor : '#d1d5db', backgroundColor: belgeBase64[fieldName] ? 'transparent' : '#f9fafb' }}
                 title={label}
                 onClick={() => {
                   if (belgeBase64[fieldName]) {
                     setSelectedBelgeData({ imageData: belgeBase64[fieldName], type: label, adi: formData.adSoyad || 'Müşteri', customerId: null });
                     setShowBelgeModal(true);
                   }
                 }}
               >
                 {belgeBase64[fieldName] ? (
                   <img src={belgeBase64[fieldName]} alt={label} className="w-full h-full object-cover" />
                 ) : (
                   <span className="text-xs font-semibold" style={{ color: themeColor }}>{label}</span>
                 )}
               </div>
             ))}
           </div>
         </div>
         
         <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
           <form onSubmit={handleSubmit}>
           {/* Form Grid - 2 Columns */}
           <div className="grid grid-cols-2 gap-4 mb-6">
           {/* Ad Soyad */}
           <div>
             <label className="block text-sm font-medium mb-1" style={{ color: themeColor }}>Ad Soyad</label>
             <input
               type="text"
               name="adSoyad"
               value={formData.adSoyad}
               onChange={handleChange}
               placeholder="Ör: Ayşe Yılmaz"
               className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 text-sm transition"
               style={{ borderColor: 'rgb(209, 213, 219)', boxShadow: 'rgba(33, 150, 243, 0) 0 0 0 0' }}
               onFocus={(e) => {
                 e.target.style.borderColor = themeColor;
                 e.target.style.boxShadow = `0 0 0 3px ${themeColor}20`;
               }}
               onBlur={(e) => {
                 e.target.style.borderColor = 'rgb(209, 213, 219)';
                 e.target.style.boxShadow = 'rgba(33, 150, 243, 0) 0 0 0 0';
               }}
             />
           </div>

           {/* Telefon */}
           <div>
             <label className="block text-sm font-medium mb-1" style={{ color: themeColor }}>Telefon</label>
             <input
               type="tel"
               name="telefon"
               value={formData.telefon}
               onChange={handleChange}
               placeholder="+90 5XX XXX XX XX"
               className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 text-sm transition"
               style={{ borderColor: 'rgb(209, 213, 219)', boxShadow: 'rgba(33, 150, 243, 0) 0 0 0 0' }}
               onFocus={(e) => {
                 e.target.style.borderColor = themeColor;
                 e.target.style.boxShadow = `0 0 0 3px ${themeColor}20`;
               }}
               onBlur={(e) => {
                 e.target.style.borderColor = 'rgb(209, 213, 219)';
                 e.target.style.boxShadow = 'rgba(33, 150, 243, 0) 0 0 0 0';
               }}
             />
           </div>

           {/* Marka / Model */}
           <div>
             <label className="block text-sm font-medium mb-1" style={{ color: themeColor }}>Marka / Model</label>
             <input
               type="text"
               name="markaModel"
               value={formData.markaModel}
               onChange={handleChange}
               placeholder="Ör: Samsung Galaxy S22"
               className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 text-sm transition"
               style={{ borderColor: 'rgb(209, 213, 219)', boxShadow: 'rgba(33, 150, 243, 0) 0 0 0 0' }}
               onFocus={(e) => {
                 e.target.style.borderColor = themeColor;
                 e.target.style.boxShadow = `0 0 0 3px ${themeColor}20`;
               }}
               onBlur={(e) => {
                 e.target.style.borderColor = 'rgb(209, 213, 219)';
                 e.target.style.boxShadow = 'rgba(33, 150, 243, 0) 0 0 0 0';
               }}
             />
           </div>

           {/* Aksesuarlar */}
           <div>
             <label className="block text-sm font-medium mb-1" style={{ color: themeColor }}>Aksesuarlar</label>
             <input
               type="text"
               name="aksesuarlar"
               value={formData.aksesuarlar}
               onChange={handleChange}
               placeholder="Kutu, şarj aleti, kalem vb."
               className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 text-sm transition"
               style={{ borderColor: 'rgb(209, 213, 219)', boxShadow: 'rgba(33, 150, 243, 0) 0 0 0 0' }}
               onFocus={(e) => {
                 e.target.style.borderColor = themeColor;
                 e.target.style.boxShadow = `0 0 0 3px ${themeColor}20`;
               }}
               onBlur={(e) => {
                 e.target.style.borderColor = 'rgb(209, 213, 219)';
                 e.target.style.boxShadow = 'rgba(33, 150, 243, 0) 0 0 0 0';
               }}
             />
           </div>
           </div>

           {/* Belgeler Yükleme */}
           <div className="mb-6">
             <label className="block text-sm font-medium mb-3 text-center" style={{ color: themeColor }}>📄 Belgeler</label>
             <div className="flex justify-center flex-wrap gap-2">
               {[['Fatura (F)', 'belge_f'], ['Garanti (G)', 'belge_g'], ['Üretim (Ü)', 'belge_u'], ['Arıza (A)', 'belge_a']].map(([label, fieldName]) => (
                 <label key={fieldName} className="relative group">
                   <button
                     type="button"
                     className="px-3 py-1 border rounded text-sm hover:bg-gray-50 transition flex items-center gap-1"
                     style={{ borderColor: themeColor, color: themeColor }}
                     onClick={(e) => e.currentTarget.nextElementSibling.click()}
                   >
                     <span className="material-icons text-sm">attach_file</span>
                     {label}
                     {formData[fieldName] && <span className="text-green-600 text-xs">✓</span>}
                   </button>
                   <input
                     type="file"
                     accept="image/*"
                     className="hidden"
                     name={fieldName}
                     onChange={handleFileChange}
                   />
                 </label>
               ))}
             </div>
           </div>

           {/* Full-width fields */}
           <div className="space-y-4">
           {/* Müşteri Şikayeti */}
           <div>
             <label className="block text-sm font-medium mb-1" style={{ color: themeColor }}>Müşteri Şikayeti</label>
             <textarea
               name="museriSikayeti"
               value={formData.museriSikayeti}
               onChange={handleChange}
               placeholder="Cihazın yaşadığı problemi detaylıca yazın."
               rows="3"
               className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 text-sm transition"
               style={{ borderColor: 'rgb(209, 213, 219)', boxShadow: 'rgba(33, 150, 243, 0) 0 0 0 0' }}
               onFocus={(e) => {
                 e.target.style.borderColor = themeColor;
                 e.target.style.boxShadow = `0 0 0 3px ${themeColor}20`;
               }}
               onBlur={(e) => {
                 e.target.style.borderColor = 'rgb(209, 213, 219)';
                 e.target.style.boxShadow = 'rgba(33, 150, 243, 0) 0 0 0 0';
               }}
             />
           </div>

           {/* Not */}
           <div>
             <label className="block text-sm font-medium mb-1" style={{ color: themeColor }}>Not (Varsa)</label>
             <textarea
               name="not"
               value={formData.not}
               onChange={handleChange}
               placeholder="Ek bilgi veya hatırlatmalar."
               rows="2"
               className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 text-sm transition"
               style={{ borderColor: 'rgb(209, 213, 219)', boxShadow: 'rgba(33, 150, 243, 0) 0 0 0 0' }}
               onFocus={(e) => {
                 e.target.style.borderColor = themeColor;
                 e.target.style.boxShadow = `0 0 0 3px ${themeColor}20`;
               }}
               onBlur={(e) => {
                 e.target.style.borderColor = 'rgb(209, 213, 219)';
                 e.target.style.boxShadow = 'rgba(33, 150, 243, 0) 0 0 0 0';
               }}
             />
           </div>
           </div>

           {/* Buttons */}
           <div className="flex gap-3 pt-4">
             <button
               type="submit"
               disabled={isLoading || isCompressing}
               className="w-full text-white px-4 py-2 rounded-lg font-medium hover:opacity-90 transition text-sm disabled:opacity-50 disabled:cursor-not-allowed"
               style={{ backgroundColor: themeColor }}
             >
               {isCompressing ? 'Resim Hazırlanıyor...' : isLoading ? 'Gönderiliyor...' : 'Kaydet'}
             </button>
           </div>

           {/* Success/Error Message */}
           {submitMessage && (
             <div className={`mt-4 p-4 rounded-lg border ${
               submitMessage.type === 'success' 
                 ? 'bg-green-50 border-green-200' 
                 : 'bg-red-50 border-red-200'
             }`}>
               <p className={`font-semibold ${
                 submitMessage.type === 'success' 
                   ? 'text-green-800' 
                   : 'text-red-800'
               }`}>
                 {submitMessage.title}
               </p>
               <p className={`text-sm mt-1 ${
                 submitMessage.type === 'success' 
                   ? 'text-green-700' 
                   : 'text-red-700'
               }`}>
                 {submitMessage.message}
               </p>
             </div>
           )}

         </form>
       </div>
       </div>

       {/* Belge Modal */}
       {showBelgeModal && selectedBelgeData && (
         <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
           <div className="bg-white rounded-xl max-w-2xl w-full h-[90vh] flex flex-col shadow-2xl">
             <div className="p-6 border-b flex justify-between items-center">
               <h3 className="text-xl font-semibold">{selectedBelgeData.type} Belgesi - {selectedBelgeData.adi}</h3>
               <button 
                 onClick={() => setShowBelgeModal(false)}
                 className="text-gray-500 hover:text-gray-700 text-2xl"
               >
                 ✕
               </button>
             </div>

             <div className="flex-1 overflow-auto flex items-center justify-center bg-gray-50 p-4">
               {selectedBelgeData.imageData ? (
                 <img src={selectedBelgeData.imageData} alt={`${selectedBelgeData.type} Belgesi`} className="max-w-full max-h-full object-contain" />
               ) : (
                 <p className="text-gray-500">Henüz resim yüklenmemiş</p>
               )}
             </div>

             <div className="p-6 border-t flex gap-2 justify-end">
               <button
                 onClick={() => setShowBelgeModal(false)}
                 className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition"
               >
                 Kapat
               </button>
               {selectedBelgeData.imageData && (
                 <button
                  onClick={async () => {
                    try {
                      await downloadBelgeAsCompressedJpg(selectedBelgeData);
                    } catch (error) {
                      showToast(error?.message || 'İndirme hatası', 'error');
                    }
                  }}
                   className="px-4 py-2 text-white rounded-lg hover:opacity-90 transition"
                   style={{ backgroundColor: themeColor }}
                 >
                   İndir
                 </button>
               )}
             </div>
           </div>
         </div>
       )}
    </div>
  );
}

function MusteriMontaj() {
  return (
    <div className="p-4 border-2 border-gray-200 border-dashed rounded-lg dark:border-gray-700">
       <h2 className="text-2xl font-bold mb-4 dark:text-white">Müşteri Montaj</h2>
       <p className="text-gray-700 dark:text-gray-300">Müşteri montaj bilgileri burada yönetilir.</p>
    </div>
  );
}

function MontajEkle() {
  const navigate = useNavigate();
  const [montajList, setMontajList] = useState([]);
  const [level3Users, setLevel3Users] = useState([]);
  const [montajLoading, setMontajLoading] = useState(true);
  const [actionMenu, setActionMenu] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editMontajId, setEditMontajId] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [isUploadingEditFatura, setIsUploadingEditFatura] = useState(false);
  const [editFaturaFile, setEditFaturaFile] = useState(null);
  const [editHasFatura, setEditHasFatura] = useState(false);
  const [editForm, setEditForm] = useState({
    rnuIsEmriNo: '',
    adSoyad: '',
    telefon: '',
    model: '',
    adres: '',
    servisTipi: '',
    atananKullaniciUsernames: [],
  });

  const parseAssignedUsernames = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return [];

    return raw
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter((item, index, arr) => item && arr.indexOf(item) === index);
  };

  const formatAssignedUsers = (value) => {
    const usernames = parseAssignedUsernames(value);
    if (!usernames.length) return '-';

    return usernames
      .map((username) => {
        const found = level3Users.find((user) => String(user?.username || '').toLowerCase() === username);
        return found?.ad_soyad || found?.username || username;
      })
      .join(', ');
  };

  const normalizePhone = (value) => {
    const cleaned = String(value || '').trim();
    if (!cleaned) return '';
    return cleaned.startsWith('0') ? cleaned : `0${cleaned}`;
  };

  const openEditModal = (item) => {
    setEditMontajId(item.id || '');
    setEditFaturaFile(null);
    setEditHasFatura(Boolean(item.belge_f));
    setEditForm({
      rnuIsEmriNo: item.rnu_is_emri_no || '',
      adSoyad: item.ad_soyad || '',
      telefon: item.telefon || '',
      model: item.model || '',
      adres: item.adres || '',
      servisTipi: item.servis_tipi || '',
      atananKullaniciUsernames: parseAssignedUsernames(item.atanan_kullanici_username),
    });
    setShowEditModal(true);
  };

  const handleEditMontaj = async (e) => {
    e.preventDefault();

    if (!editMontajId) {
      alert('Güncellenecek kayıt bulunamadı.');
      return;
    }

    const normalizedPhone = normalizePhone(editForm.telefon);

    if (!editForm.adSoyad.trim() || !normalizedPhone.trim() || !editForm.model.trim() || !editForm.servisTipi.trim()) {
      alert('Ad Soyad, Telefon, Model ve Servis Tipi zorunludur.');
      return;
    }

    setIsUpdating(true);
    try {
      let belgeF = undefined;
      if (editFaturaFile) {
        belgeF = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error('Fatura dosyası okunamadı'));
          reader.readAsDataURL(editFaturaFile);
        });
      }

      const normalizedAssignedUsernames = editForm.atananKullaniciUsernames.join(',');

      const response = await fetch(`/api/montaj/${editMontajId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rnu_is_emri_no: editForm.rnuIsEmriNo,
          ad_soyad: editForm.adSoyad,
          telefon: normalizedPhone,
          model: editForm.model,
          adres: editForm.adres,
          servis_tipi: editForm.servisTipi,
          atanan_kullanici_username: normalizedAssignedUsernames,
          belge_f: belgeF,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(errText || 'Güncelleme başarısız');
      }

      setMontajList((prev) => prev.map((item) => {
        if (item.id !== editMontajId) {
          return item;
        }

        return {
          ...item,
          rnu_is_emri_no: editForm.rnuIsEmriNo?.trim() || '',
          ad_soyad: editForm.adSoyad?.trim() || '',
          telefon: normalizedPhone,
          model: editForm.model?.trim() || '',
          adres: editForm.adres?.trim() || '',
          servis_tipi: editForm.servisTipi?.trim() || '',
          atanan_kullanici_username: normalizedAssignedUsernames,
          belge_f: belgeF ? true : item.belge_f,
        };
      }));

      fetchMontajList();
      setShowEditModal(false);
      setEditMontajId('');
      setEditFaturaFile(null);
      setEditHasFatura(false);
    } catch (error) {
      console.error('Montaj update error:', error);
      alert(`Kayıt güncellenemedi: ${error.message}`);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleEditFaturaInstantUpload = async (file) => {
    if (!file || !editMontajId) {
      return;
    }

    setIsUploadingEditFatura(true);
    try {
      const belgeF = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Fatura dosyası okunamadı'));
        reader.readAsDataURL(file);
      });

      const response = await fetch(`/api/montaj/${editMontajId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ belge_f: belgeF }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(errText || 'Fatura yükleme başarısız');
      }

      setEditHasFatura(true);
      setEditFaturaFile(null);
      await fetchMontajList();
      alert('✅ Fatura anlık yüklendi.');
    } catch (error) {
      console.error('Montaj fatura upload error:', error);
      alert('❌ Fatura yüklenemedi.');
    } finally {
      setIsUploadingEditFatura(false);
    }
  };

  const handleDeleteMontaj = async (id) => {
    const confirmed = confirm('Bu montaj kaydını silmek istediğinizden emin misiniz?');
    if (!confirmed) return;

    if (!confirmMathDelete()) return;

    try {
      const response = await fetch(`/api/montaj/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(errText || 'Silme başarısız');
      }

      await fetchMontajList();
    } catch (error) {
      console.error('Montaj delete error:', error);
      alert('Kayıt silinemedi.');
    }
  };

  const handleDownloadMontajZip = (id) => {
    if (!id) return;
    window.open(`/api/montaj/${id}/download-zip`, '_blank');
  };

  const handleOpenMontajFatura = async (id) => {
    if (!id) return;

    try {
      const response = await fetch(`/api/montaj/${id}`);
      if (!response.ok) {
        throw new Error('Fatura bilgisi alınamadı');
      }

      const detail = await response.json();
      const fatura = detail?.belge_f;

      if (!fatura) {
        alert('Bu kayıtta fatura bulunamadı.');
        return;
      }

      if (typeof fatura === 'string' && fatura.startsWith('data:')) {
        if (fatura.startsWith('data:image/')) {
          const popup = window.open('', '_blank');
          if (!popup) {
            alert('Fatura penceresi açılamadı. Popup engelini kaldırın.');
            return;
          }

          popup.document.write(`
            <html>
              <head><title>Fatura</title></head>
              <body style="margin:0;display:flex;align-items:center;justify-content:center;background:#111;">
                <img src="${fatura}" alt="Fatura" style="max-width:100%;max-height:100vh;" />
              </body>
            </html>
          `);
          popup.document.close();
        } else {
          window.open(fatura, '_blank');
        }
      } else {
        window.open(fatura, '_blank');
      }
    } catch (error) {
      console.error('Fatura açma hatası:', error);
      alert('Fatura açılamadı.');
    }
  };

  const closeActionMenu = () => {
    setActionMenu(null);
  };

  const toggleActionMenu = (event, id, isMobile = false) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = isMobile ? Math.max(rect.width, 180) : 180;

    let left = isMobile ? rect.left : rect.right - menuWidth;
    left = Math.max(8, Math.min(left, window.innerWidth - menuWidth - 8));

    let top = rect.bottom + 6;
    top = Math.max(8, Math.min(top, window.innerHeight - 8));

    setActionMenu((prev) => (
      prev?.id === id
        ? null
        : { id, left, top, width: menuWidth }
    ));
  };

  const fetchMontajList = async () => {
    setMontajLoading(true);
    try {
      const response = await fetch('/api/montaj');
      const data = await response.json();
      setMontajList(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Montaj liste fetch error:', error);
      setMontajList([]);
    } finally {
      setMontajLoading(false);
    }
  };

  const fetchLevel3Users = async () => {
    try {
      const response = await fetch('/api/users');
      if (!response.ok) {
        setLevel3Users([]);
        return;
      }

      const data = await response.json();
      const users = Array.isArray(data)
        ? data.filter((user) => user?.level === 'level3')
        : [];

      setLevel3Users(users);
    } catch (error) {
      setLevel3Users([]);
    }
  };

  useEffect(() => {
    fetchMontajList();
    fetchLevel3Users();
  }, []);

  useDataRefreshListener(() => {
    fetchMontajList();
    fetchLevel3Users();
  }, []);

  return (
    <div className="p-4">
       <div className="grid grid-cols-1 gap-6 mb-6">
         <div
           onClick={() => navigate('/monta-ekle')}
           className="bg-white border border-gray-200 rounded-xl p-6 transition-shadow hover:shadow-lg cursor-pointer"
         >
           <div className="flex items-start gap-4">
             <div className="bg-blue-200 rounded-lg p-3 flex-shrink-0">
               <span className="material-icons text-2xl text-gray-700">construction</span>
             </div>
             <div className="flex-1">
               <h3 className="text-lg font-semibold text-gray-900 mb-2">Montaj Ekleme</h3>
               <p className="text-gray-600 text-sm">Yeni montaj kaydı oluşturma işlemini başlatın.</p>
             </div>
           </div>
         </div>
       </div>

       <div>
         <h3 className="text-lg font-semibold text-gray-900 mb-4">Montaj Kayıtları</h3>

         {montajLoading ? (
           <p className="text-center text-gray-500">Yükleniyor...</p>
         ) : montajList.length === 0 ? (
           <p className="text-center text-gray-500">Henüz montaj kaydı yok.</p>
         ) : (
           <>
             <div className="hidden md:block relative bg-gray-50 shadow-sm rounded-lg border border-gray-200 overflow-visible">
               <div className="overflow-x-auto overflow-y-visible">
               <table className="w-full text-sm text-left text-gray-700">
                 <thead className="text-sm font-semibold text-gray-900 border-b border-gray-200 bg-gray-100">
                   <tr>
                     <th className="px-6 py-3">RNU İş Emri</th>
                     <th className="px-6 py-3">İsim</th>
                     <th className="px-6 py-3">Telefon</th>
                     <th className="px-6 py-3">Model</th>
                     <th className="px-6 py-3">Servis Tipi</th>
                     <th className="px-6 py-3">Atanan</th>
                     <th className="px-6 py-3">Tarih</th>
                      <th className="px-6 py-3 text-right">İşlemler</th>
                   </tr>
                 </thead>
                 <tbody>
                   {montajList.map((item) => (
                     <tr key={item.id} className={`${item.kapatildi ? 'bg-amber-50' : 'bg-white'} border-b border-gray-200 hover:bg-gray-50 transition`}>
                       <td className="px-6 py-4">{item.rnu_is_emri_no || '-'}</td>
                       <td className="px-6 py-4 font-medium">
                         <div className="flex items-center gap-2">
                           <span>{item.ad_soyad || '-'}</span>
                           {item.kapatildi && (
                             <span className="px-2 py-0.5 text-[10px] font-semibold rounded bg-amber-100 text-amber-800 border border-amber-300">KAPALI</span>
                           )}
                         </div>
                       </td>
                       <td className="px-6 py-4">{item.telefon || '-'}</td>
                      <td className="px-6 py-4">
                        {item.belge_f ? (
                          <button
                            type="button"
                            onClick={() => handleOpenMontajFatura(item.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800 border border-green-300 hover:bg-green-200"
                            title="Fatura yüklü - Aç"
                          >
                            {item.model || '-'}
                          </button>
                        ) : (
                          <span>{item.model || '-'}</span>
                        )}
                      </td>
                       <td className="px-6 py-4">{item.servis_tipi || '-'}</td>
                       <td className="px-6 py-4">{formatAssignedUsers(item.atanan_kullanici_username)}</td>
                       <td className="px-6 py-4">
                         {item.created_at ? new Date(item.created_at).toLocaleString('tr-TR') : '-'}
                       </td>
                       <td className="px-6 py-4 text-right relative">
                         <div className="relative inline-block text-left">
                           <button
                             type="button"
                             onClick={(e) => toggleActionMenu(e, item.id, false)}
                             className="px-3 py-1.5 text-xs rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
                           >
                             İşlemler
                           </button>
                         </div>
                       </td>
                     </tr>
                   ))}
                 </tbody>
               </table>
               </div>
             </div>

             <div className="md:hidden space-y-4">
               {montajList.map((item) => (
                 <div key={item.id} className={`${item.kapatildi ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-200'} rounded-lg border p-4 shadow-sm overflow-visible`}>
                   <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                     <span>{item.ad_soyad || '-'}</span>
                     {item.kapatildi && (
                       <span className="px-2 py-0.5 text-[10px] font-semibold rounded bg-amber-100 text-amber-800 border border-amber-300">KAPALI</span>
                     )}
                   </h3>
                   <p className="text-xs text-gray-500 mt-1">
                     {item.created_at ? new Date(item.created_at).toLocaleString('tr-TR') : '-'}
                   </p>

                   <div className="space-y-2 mt-4">
                     <div className="flex justify-between text-sm">
                       <span className="text-gray-600">RNU İş Emri:</span>
                       <span className="font-medium">{item.rnu_is_emri_no || '-'}</span>
                     </div>
                     <div className="flex justify-between text-sm">
                       <span className="text-gray-600">Telefon:</span>
                       <span className="font-medium">{item.telefon || '-'}</span>
                     </div>
                     <div className="flex justify-between text-sm items-center gap-2">
                       <span className="text-gray-600">Model:</span>
                       {item.belge_f ? (
                         <button
                           type="button"
                           onClick={() => handleOpenMontajFatura(item.id)}
                           className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800 border border-green-300 hover:bg-green-200"
                           title="Fatura yüklü - Aç"
                         >
                           {item.model || '-'}
                         </button>
                       ) : (
                         <span className="font-medium">{item.model || '-'}</span>
                       )}
                     </div>
                     <div className="flex justify-between text-sm">
                       <span className="text-gray-600">Servis Tipi:</span>
                       <span className="font-medium">{item.servis_tipi || '-'}</span>
                     </div>
                     <div className="flex justify-between text-sm">
                       <span className="text-gray-600">Atanan:</span>
                       <span className="font-medium">{formatAssignedUsers(item.atanan_kullanici_username)}</span>
                     </div>
                   </div>

                   <div className="relative mt-4">
                     <button
                       type="button"
                       onClick={(e) => toggleActionMenu(e, item.id, true)}
                       className="w-full px-3 py-2 text-sm rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
                     >
                       İşlemler
                     </button>
                   </div>
                 </div>
               ))}
             </div>

             {actionMenu && (
               (() => {
                 const selectedItem = montajList.find((entry) => entry.id === actionMenu.id);
                 if (!selectedItem) return null;

                 return (
                   <>
                     <button
                       type="button"
                       className="fixed inset-0 z-[90] cursor-default"
                       onClick={closeActionMenu}
                       aria-label="Menüyü kapat"
                     />
                     <div
                       className="fixed rounded-lg border border-gray-200 bg-white shadow-lg z-[100] overflow-hidden"
                       style={{ left: `${actionMenu.left}px`, top: `${actionMenu.top}px`, width: `${actionMenu.width}px` }}
                     >
                       <button
                         type="button"
                         onClick={() => {
                           openEditModal(selectedItem);
                           closeActionMenu();
                         }}
                         className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                       >
                         Düzenle
                       </button>
                       <button
                         type="button"
                         onClick={() => {
                           handleDeleteMontaj(selectedItem.id);
                           closeActionMenu();
                         }}
                         className="w-full text-left px-3 py-2 text-sm text-red-700 hover:bg-red-50"
                       >
                         Sil
                       </button>
                       <button
                         type="button"
                         onClick={() => {
                           handleDownloadMontajZip(selectedItem.id);
                           closeActionMenu();
                         }}
                         className="w-full text-left px-3 py-2 text-sm text-blue-700 hover:bg-blue-50"
                       >
                         Dosyaları İndir
                       </button>
                     </div>
                   </>
                 );
               })()
             )}
           </>
         )}
       </div>

       {showEditModal && (
         <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white w-full max-w-6xl rounded-xl shadow-xl border border-gray-200 max-h-[90vh] overflow-y-auto">
             <div className="p-4 border-b border-gray-200 flex items-center justify-between">
               <h3 className="text-lg font-semibold text-gray-900">Montaj Kaydı Düzenle</h3>
               <button
                 type="button"
                 onClick={() => setShowEditModal(false)}
                 className="material-icons text-gray-500 hover:text-gray-700"
               >
                 close
               </button>
             </div>

             <form onSubmit={handleEditMontaj} className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
               <div>
                 <label className="block text-sm font-medium text-gray-700 mb-1">RNU İş Emri No</label>
                 <input
                   type="text"
                   value={editForm.rnuIsEmriNo}
                   onChange={(e) => setEditForm((prev) => ({ ...prev, rnuIsEmriNo: e.target.value }))}
                   className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
                 />
               </div>

               <div>
                 <label className="block text-sm font-medium text-gray-700 mb-1">İsim Soyisim</label>
                 <input
                   type="text"
                   value={editForm.adSoyad}
                   onChange={(e) => setEditForm((prev) => ({ ...prev, adSoyad: e.target.value }))}
                   className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
                 />
               </div>

               <div>
                 <label className="block text-sm font-medium text-gray-700 mb-1">Model</label>
                 <input
                   type="text"
                   value={editForm.model}
                   onChange={(e) => setEditForm((prev) => ({ ...prev, model: e.target.value }))}
                   className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
                 />
               </div>

               <div>
                 <label className="block text-sm font-medium text-gray-700 mb-1">Fatura (Opsiyonel)</label>
                 <input
                   type="file"
                   accept="image/*,.pdf,application/pdf"
                  disabled={isUploadingEditFatura}
                  onChange={async (e) => {
                     const file = e.target.files?.[0] || null;
                     if (!file) {
                       setEditFaturaFile(null);
                       return;
                     }

                     const isImage = file.type.startsWith('image/');
                     const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
                     if (!isImage && !isPdf) {
                       alert('Lütfen resim veya PDF dosyası seçin.');
                       e.target.value = '';
                       setEditFaturaFile(null);
                       return;
                     }

                     setEditFaturaFile(file);
                    await handleEditFaturaInstantUpload(file);
                    e.target.value = '';
                   }}
                   className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
                 />
                 <p className="mt-1 text-xs text-gray-500">
                  {isUploadingEditFatura
                    ? 'Fatura yükleniyor...'
                    : editFaturaFile
                     ? `Seçilen dosya: ${editFaturaFile.name}`
                     : editHasFatura
                       ? 'Bu kayıtta mevcut fatura var. Yeni dosya seçerseniz üzerine yazılır.'
                       : 'Henüz fatura yüklenmemiş.'}
                 </p>
                 {editHasFatura && !editFaturaFile && (
                   <button
                     type="button"
                     onClick={() => handleOpenMontajFatura(editMontajId)}
                     className="mt-2 inline-flex items-center px-3 py-1.5 text-xs rounded border border-green-300 text-green-700 bg-green-50 hover:bg-green-100"
                   >
                     Mevcut faturayı aç
                   </button>
                 )}
               </div>

               <div>
                 <label className="block text-sm font-medium text-gray-700 mb-1">Telefon</label>
                 <input
                   type="tel"
                   value={editForm.telefon}
                   onChange={(e) => setEditForm((prev) => ({ ...prev, telefon: e.target.value }))}
                   onBlur={() => setEditForm((prev) => ({ ...prev, telefon: normalizePhone(prev.telefon) }))}
                   className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
                 />
               </div>

               <div className="md:col-span-2">
                 <label className="block text-sm font-medium text-gray-700 mb-1">Adres</label>
                 <textarea
                   rows="3"
                   value={editForm.adres}
                   onChange={(e) => setEditForm((prev) => ({ ...prev, adres: e.target.value }))}
                   className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
                 />
               </div>

               <div className="md:col-span-2">
                 <label className="block text-sm font-medium text-gray-700 mb-1">Servis Tipi</label>
                 <div className="w-full border border-gray-300 rounded-lg p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                   {[
                     { value: 'TV_MONTAJ', label: 'TV Montaj' },
                     { value: 'TV_ARIZA', label: 'TV Arıza' },
                     { value: 'ROBOT_KURULUM', label: 'Robot Kurulum' },
                     { value: 'ROBOT_ARIZA', label: 'Robot Arıza' },
                   ].map((item) => (
                     <label key={item.value} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                       <input
                         type="radio"
                         name="editServisTipi"
                         value={item.value}
                         checked={editForm.servisTipi === item.value}
                         onChange={(e) => setEditForm((prev) => ({ ...prev, servisTipi: e.target.value }))}
                         className="sr-only"
                       />
                       <span
                         className={`w-5 h-5 rounded-full border flex items-center justify-center transition ${
                           editForm.servisTipi === item.value ? 'border-green-500 bg-green-50' : 'border-gray-300 bg-white'
                         }`}
                       >
                         {editForm.servisTipi === item.value && (
                           <span className="material-icons text-[14px] leading-none text-green-600">check</span>
                         )}
                       </span>
                       <span>{item.label}</span>
                     </label>
                   ))}
                 </div>
               </div>

               <div className="md:col-span-2">
                 <label className="block text-sm font-medium text-gray-700 mb-1">Atama (Level3)</label>
                 <div className="w-full border border-gray-300 rounded-lg p-3 space-y-2 max-h-44 overflow-y-auto">
                   {level3Users.length === 0 ? (
                     <p className="text-sm text-gray-500">Atanabilir kullanıcı bulunamadı.</p>
                   ) : (
                     level3Users.map((user) => {
                       const username = String(user.username || '').toLowerCase();
                       const checked = editForm.atananKullaniciUsernames.includes(username);

                       return (
                         <label key={user.id || user.username} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                           <input
                             type="checkbox"
                             checked={checked}
                             onChange={(e) => {
                               setEditForm((prev) => {
                                 const next = new Set(prev.atananKullaniciUsernames);
                                 if (e.target.checked) {
                                   next.add(username);
                                 } else {
                                   next.delete(username);
                                 }

                                 return {
                                   ...prev,
                                   atananKullaniciUsernames: Array.from(next),
                                 };
                               });
                             }}
                             className="w-4 h-4"
                           />
                           <span>{user.ad_soyad || user.username}</span>
                         </label>
                       );
                     })
                   )}
                 </div>
               </div>

               <div className="md:col-span-2 flex justify-end gap-2 pt-2">
                 <button
                   type="button"
                   onClick={() => {
                     setShowEditModal(false);
                     setEditFaturaFile(null);
                     setEditHasFatura(false);
                   }}
                   className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100"
                 >
                   Vazgeç
                 </button>
                 <button
                   type="submit"
                   disabled={isUpdating}
                   className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                 >
                   {isUpdating ? 'Güncelleniyor...' : 'Güncelle'}
                 </button>
               </div>
             </form>
           </div>
         </div>
       )}
    </div>
  );
}

function MontaEklePage() {
  const { themeColor } = useTheme();
  const navigate = useNavigate();
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [montajForm, setMontajForm] = useState({
    rnuIsEmriNo: '',
    adSoyad: '',
    model: '',
    telefon: '',
    adres: '',
    servisTipi: ''
  });

  const ensureLeadingZero = (value) => {
    const cleaned = String(value || '').trim();
    if (!cleaned) return '';
    return cleaned.startsWith('0') ? cleaned : `0${cleaned}`;
  };

  const handleInputChange = (field, value) => {
    setMontajForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handlePhoneBlur = () => {
    setMontajForm((prev) => ({
      ...prev,
      telefon: ensureLeadingZero(prev.telefon),
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const normalizedPhone = ensureLeadingZero(montajForm.telefon);

    if (!montajForm.adSoyad.trim() || !normalizedPhone.trim() || !montajForm.model.trim() || !montajForm.servisTipi) {
      alert('İsim Soyisim, Model, Telefon ve Servis Tipi zorunludur.');
      return;
    }

    const payload = {
      rnu_is_emri_no: montajForm.rnuIsEmriNo?.trim() || null,
      ad_soyad: montajForm.adSoyad.trim(),
      model: montajForm.model.trim(),
      telefon: normalizedPhone,
      adres: montajForm.adres?.trim() || null,
      servis_tipi: montajForm.servisTipi,
    };

    setIsSaving(true);
    try {
      const response = await fetch('/api/montaj', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Kayıt başarısız');
      }

      setMontajForm({
        rnuIsEmriNo: '',
        adSoyad: '',
        model: '',
        telefon: '',
        adres: '',
        servisTipi: '',
      });
      setSaveMessage('Montaj kaydı başarıyla eklendi.');
    } catch (error) {
      console.error('Montaj kayıt hatası:', error);
      alert(`Kayıt sırasında hata oluştu: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-4">
      <div className="bg-white rounded-xl w-full max-w-none shadow-sm border border-gray-200 overflow-y-auto">
        <div className="p-5 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-xl font-semibold text-gray-900">Montaj Ekleme</h3>
          <button
            type="button"
            onClick={() => navigate('/montaj/ekle')}
            className="material-icons text-gray-500 hover:text-gray-700"
          >
            close
          </button>
        </div>

        {saveMessage && (
          <div className="mx-5 mt-5 px-4 py-3 rounded-lg border border-green-300 bg-green-50 text-green-800 text-sm font-medium">
            {saveMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Varsa RNU İş Emri No</label>
            <input
              type="text"
              value={montajForm.rnuIsEmriNo}
              onChange={(e) => handleInputChange('rnuIsEmriNo', e.target.value)}
              placeholder="Örn: RNU-12345"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">İsim Soyisim</label>
            <input
              type="text"
              value={montajForm.adSoyad}
              onChange={(e) => handleInputChange('adSoyad', e.target.value)}
              placeholder="Örn: Mehmet Demir"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Model</label>
            <input
              type="text"
              value={montajForm.model}
              onChange={(e) => handleInputChange('model', e.target.value)}
              placeholder="Örn: Samsung Neo QLED"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Telefon</label>
            <input
              type="tel"
              value={montajForm.telefon}
              onChange={(e) => handleInputChange('telefon', e.target.value)}
              onBlur={handlePhoneBlur}
              placeholder="+90 5XX XXX XX XX"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Adres</label>
            <textarea
              value={montajForm.adres}
              onChange={(e) => handleInputChange('adres', e.target.value)}
              placeholder="Adres bilgisi"
              rows="3"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Servis Tipi</label>
            <div className="w-full border border-gray-300 rounded-lg p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { value: 'TV_MONTAJ', label: 'TV Montaj' },
                { value: 'TV_ARIZA', label: 'TV Arıza' },
                { value: 'ROBOT_KURULUM', label: 'Robot Kurulum' },
                { value: 'ROBOT_ARIZA', label: 'Robot Arıza' },
              ].map((item) => (
                <label key={item.value} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="radio"
                    name="servisTipi"
                    value={item.value}
                    checked={montajForm.servisTipi === item.value}
                    onChange={(e) => handleInputChange('servisTipi', e.target.value)}
                    className="sr-only"
                  />
                  <span
                    className={`w-5 h-5 rounded-full border flex items-center justify-center transition ${
                      montajForm.servisTipi === item.value ? 'border-green-500 bg-green-50' : 'border-gray-300 bg-white'
                    }`}
                  >
                    {montajForm.servisTipi === item.value && (
                      <span className="material-icons text-[14px] leading-none text-green-600">check</span>
                    )}
                  </span>
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="pt-2 flex justify-end gap-2 md:col-span-2">
            <button
              type="button"
              onClick={() => navigate('/montaj/ekle')}
              className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100"
            >
              Vazgeç
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-4 py-2 rounded-lg text-white disabled:opacity-60"
              style={{ backgroundColor: themeColor }}
            >
              {isSaving ? 'Kaydediliyor...' : 'Kaydet'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function MontajListele() {
  return (
    <div className="p-4 border-2 border-gray-200 border-dashed rounded-lg dark:border-gray-700">
       <h2 className="text-2xl font-bold mb-4 dark:text-white">Montaj Kaydı Listele</h2>
       <p className="text-gray-700 dark:text-gray-300 mb-4">Tüm montaj kayıtları listelenir.</p>
       <div className="mt-4 overflow-x-auto">
         <table className="w-full text-sm border-collapse">
           <thead>
             <tr className="bg-gray-100">
               <th className="border p-2 text-left">ID</th>
               <th className="border p-2 text-left">Müşteri</th>
               <th className="border p-2 text-left">Ürün</th>
               <th className="border p-2 text-left">Tarih</th>
               <th className="border p-2 text-left">İşlem</th>
             </tr>
           </thead>
           <tbody>
             <tr>
               <td colSpan="5" className="border p-2 text-gray-500 text-center">Henüz kayıt yok</td>
             </tr>
           </tbody>
         </table>
       </div>
    </div>
  );
}

function CihazKurulum() {
  const { themeColor } = useTheme();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);
  const [closingId, setClosingId] = useState('');
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [selectedMontaj, setSelectedMontaj] = useState(null);
  const [kurulumTipi, setKurulumTipi] = useState('');
  const [closeFiles, setCloseFiles] = useState([]);
  const [closeProgressText, setCloseProgressText] = useState('');
  const [showFaturaModal, setShowFaturaModal] = useState(false);
  const [selectedFatura, setSelectedFatura] = useState(null);
  const currentUsername = (localStorage.getItem('username') || '').trim().toLowerCase();

  const fetchMontaj = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/montaj');
      if (!response.ok) {
        setMessage({ type: 'error', text: 'Montaj listesi alınamadı.' });
        setLoading(false);
        return;
      }

      const data = await response.json();
      const normalizedData = Array.isArray(data) ? data : [];
      setItems(normalizedData.filter((item) => {
        const assigned = String(item?.atanan_kullanici_username || '')
          .split(',')
          .map((part) => part.trim().toLowerCase())
          .filter((part) => !!part);

        return !item?.kapatildi && assigned.includes(currentUsername);
      }));
    } catch (error) {
      setMessage({ type: 'error', text: 'Sunucu bağlantısı başarısız.' });
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchMontaj();
  }, []);

  useDataRefreshListener(fetchMontaj, [currentUsername]);

  const toBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const openCloseModal = (item) => {
    setSelectedMontaj(item);
    setKurulumTipi('');
    setCloseFiles([]);
    setCloseProgressText('');
    setShowCloseModal(true);
    setMessage(null);
  };

  const handleCloseMontaj = async () => {
    const item = selectedMontaj;
    if (!item?.id) return;

    if (!kurulumTipi) {
      setMessage({ type: 'error', text: 'Lütfen Duvar veya Sehpa seçin.' });
      return;
    }

    if (!closeFiles.length) {
      setMessage({ type: 'error', text: 'Lütfen en az 1 resim seçin.' });
      return;
    }

    setClosingId(item.id);
    setMessage(null);
    setCloseProgressText('Resimler yükleniyor...');

    try {
      const resimler = await Promise.all(closeFiles.map((file) => toBase64(file)));

      setCloseProgressText('Kayıt kapatılıyor...');

      const response = await fetch(`/api/montaj/${item.id}/kapat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kurulum_tipi: kurulumTipi,
          resimler,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        setMessage({ type: 'error', text: errorText || 'Montaj kapatılamadı.' });
        setClosingId('');
        setCloseProgressText('');
        return;
      }

      setItems((prev) => prev.filter((row) => row.id !== item.id));
      setMessage({ type: 'success', text: 'Montaj kapatıldı.' });
      setShowCloseModal(false);
      setSelectedMontaj(null);
      setCloseFiles([]);
      setCloseProgressText('');
    } catch (error) {
      setMessage({ type: 'error', text: 'Sunucu bağlantısı başarısız.' });
      setCloseProgressText('');
    }

    setClosingId('');
  };

  return (
    <div className="p-4">
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900">Cihaz Kurulum Listesi</h2>
          <button
            type="button"
            onClick={fetchMontaj}
            className="px-3 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            Yenile
          </button>
        </div>

        {message && (
          <p className={`text-sm mb-3 ${message.type === 'success' ? 'text-green-700' : 'text-red-600'}`}>
            {message.text}
          </p>
        )}

        {loading ? (
          <p className="text-sm text-gray-500">Montaj kayıtları yükleniyor...</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-gray-500">Açık montaj kaydı yok.</p>
        ) : (
          <div className="space-y-3">
            {items.map((item, index) => (
              <div key={item.id || index} className="border border-gray-200 rounded-xl p-4 bg-gray-50">
                <div className="grid grid-cols-1 gap-2 mb-3">
                  <p className="text-sm text-gray-800"><span className="font-semibold">Ad Soyad:</span> {item.ad_soyad || '-'}</p>
                  <p className="text-sm text-gray-700"><span className="font-semibold">RNU İş Emri:</span> {item.rnu_is_emri_no || '-'}</p>
                  <p className="text-sm text-gray-700"><span className="font-semibold">Telefon:</span> {item.telefon || '-'}</p>
                  <p className="text-sm text-gray-700"><span className="font-semibold">Adres:</span> {item.adres || '-'}</p>
                  <div className="text-sm text-gray-700">
                    <span className="font-semibold">Model:</span>{' '}
                    <button
                      type="button"
                      onClick={async () => {
                        if (item.belge_f) {
                          const response = await fetch(`/api/montaj/${item.id}`);
                          if (response.ok) {
                            const fullItem = await response.json();
                            setSelectedFatura(fullItem);
                            setShowFaturaModal(true);
                          }
                        }
                      }}
                      className={`px-3 py-1 rounded-full text-xs font-medium ${
                        item.belge_f
                          ? 'bg-green-100 text-green-800 cursor-pointer hover:bg-green-200'
                          : 'bg-gray-200 text-gray-700'
                      }`}
                      title={item.belge_f ? 'Fatura yüklü - Tıkla' : 'Fatura yüklenmedi'}
                    >
                      {item.model || '-'} {item.belge_f && '✓'}
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => openCloseModal(item)}
                  disabled={closingId === item.id || item?.kapatildi}
                  className="w-full px-3 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-60"
                  style={{ backgroundColor: themeColor }}
                >
                  {closingId === item.id ? 'Kapatılıyor...' : 'Montajı Kapat'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {showCloseModal && selectedMontaj && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-5 w-full max-w-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">Montajı Kapat</h3>
              <button
                type="button"
                onClick={() => {
                  setShowCloseModal(false);
                  setSelectedMontaj(null);
                  setCloseFiles([]);
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>

            <p className="text-sm text-gray-700 mb-3">
              <span className="font-semibold">Kişi:</span> {selectedMontaj.ad_soyad || '-'}
            </p>
            <p className="text-sm text-gray-700 mb-3">
              <span className="font-semibold">RNU İş Emri:</span> {selectedMontaj.rnu_is_emri_no || '-'}
            </p>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Kurulum Tipi</label>
              <div className="grid grid-cols-2 gap-2">
                {['DUVAR', 'SEHPA'].map((tip) => (
                  <button
                    key={tip}
                    type="button"
                    onClick={() => setKurulumTipi(tip)}
                    className={`px-3 py-2 rounded-lg border text-sm font-medium ${kurulumTipi === tip ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                  >
                    {tip === 'DUVAR' ? 'Duvar' : 'Sehpa'}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-700 mb-2">Toplu Resim Yükle</label>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => setCloseFiles(Array.from(e.target.files || []))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">Seçilen dosya: {closeFiles.length}</p>
            </div>

            {closeProgressText && (
              <p className="text-sm text-blue-700 mb-3">{closeProgressText}</p>
            )}

            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowCloseModal(false);
                  setSelectedMontaj(null);
                  setCloseFiles([]);
                }}
                className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                İptal
              </button>
              <button
                type="button"
                onClick={handleCloseMontaj}
                disabled={closingId === selectedMontaj.id}
                className="px-4 py-2 rounded-lg text-white font-medium disabled:opacity-60"
                style={{ backgroundColor: themeColor }}
              >
                {closingId === selectedMontaj.id ? 'Kapatılıyor...' : 'Montajı Kapat'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showFaturaModal && selectedFatura && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-5 w-full max-w-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">Fatura</h3>
              <button
                type="button"
                onClick={() => {
                  setShowFaturaModal(false);
                  setSelectedFatura(null);
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>

            <div className="mb-4 text-center">
              {selectedFatura.belge_f && selectedFatura.belge_f.startsWith('data:') ? (
                <img src={selectedFatura.belge_f} alt="Fatura" className="max-h-96 mx-auto rounded-lg" />
              ) : (
                <p className="text-gray-500">Fatura görseli bulunamadı</p>
              )}
            </div>

            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowFaturaModal(false);
                  setSelectedFatura(null);
                }}
                className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function IrsaliyeOlustur() {
  const { themeColor } = useTheme();
  
  return (
    <div className="p-4 border-2 border-gray-200 border-dashed rounded-lg dark:border-gray-700">
       <h2 className="text-2xl font-bold mb-4 dark:text-white">İrsaliye Oluştur</h2>
       <p className="text-gray-700 dark:text-gray-300 mb-4">Yeni irsaliye oluşturun.</p>
       <button style={{ backgroundColor: themeColor }} className="text-white px-4 py-2 rounded-lg hover:opacity-90">Yeni İrsaliye</button>
    </div>
  );
}

function IrsaliyeListesi() {
  return (
    <div className="p-4 border-2 border-gray-200 border-dashed rounded-lg dark:border-gray-700">
       <h2 className="text-2xl font-bold mb-4 dark:text-white">İrsaliye Listesi</h2>
       <p className="text-gray-700 dark:text-gray-300">Tüm irsaliyeler listelenir.</p>
       <div className="mt-4 overflow-x-auto">
         <table className="w-full text-sm border-collapse">
           <thead>
             <tr className="bg-gray-100">
               <th className="border p-2 text-left">İrsaliye No</th>
               <th className="border p-2 text-left">Müşteri</th>
               <th className="border p-2 text-left">Tarih</th>
               <th className="border p-2 text-left">Durum</th>
             </tr>
           </thead>
           <tbody>
             <tr>
               <td className="border p-2 text-gray-500">Veri yok</td>
             </tr>
           </tbody>
         </table>
       </div>
    </div>
  );
}

// Fatura Yükleme Sayfası - Müşteriler linkle erişir
function FaturaYukle() {
  const { customerId } = useParams();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileName, setFileName] = useState('');
  const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY || '';
  const [turnstileToken, setTurnstileToken] = useState('');
  const turnstileRef = useRef(null);
  const turnstileWidgetIdRef = useRef(null);

  useEffect(() => {
    if (!turnstileSiteKey || !turnstileRef.current) return;

    const renderWidget = () => {
      if (!window.turnstile || !turnstileRef.current) return;
      if (turnstileWidgetIdRef.current !== null) return;

      turnstileWidgetIdRef.current = window.turnstile.render(turnstileRef.current, {
        sitekey: turnstileSiteKey,
        callback: (token) => setTurnstileToken(token),
        'expired-callback': () => setTurnstileToken(''),
        'error-callback': () => setTurnstileToken(''),
      });
    };

    if (window.turnstile) {
      renderWidget();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.onload = renderWidget;
    document.head.appendChild(script);

    return () => {
      if (turnstileWidgetIdRef.current !== null && window.turnstile) {
        window.turnstile.remove(turnstileWidgetIdRef.current);
        turnstileWidgetIdRef.current = null;
      }
    };
  }, [turnstileSiteKey]);

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file && file.type.startsWith('image/')) {
      setSelectedFile(file);
      setFileName(file.name);
    } else {
      setMessage({ type: 'error', text: 'Lütfen bir resim dosyası seçiniz' });
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setMessage({ type: 'error', text: 'Lütfen bir dosya seçiniz' });
      return;
    }

    if (!turnstileSiteKey) {
      setMessage({ type: 'error', text: '❌ Turnstile site key tanımlı değil. Yönetici ile iletişime geçin.' });
      return;
    }

    if (!turnstileToken) {
      setMessage({ type: 'error', text: '❌ Lütfen captcha doğrulamasını tamamlayın.' });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64 = event.target.result;

        const response = await fetch(`/api/fatura-upload/${customerId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            belge_f: base64,
            turnstile_token: turnstileToken,
          })
        });

        if (response.ok || response.status === 204) {
          setMessage({ type: 'success', text: '✅ Fatura başarıyla yüklendi!' });
          setSelectedFile(null);
          setFileName('');
          setTurnstileToken('');
          if (turnstileWidgetIdRef.current !== null && window.turnstile) {
            window.turnstile.reset(turnstileWidgetIdRef.current);
          }
          triggerDataRefresh();
        } else {
          const errorText = await response.text();
          setMessage({ type: 'error', text: `❌ Yükleme başarısız oldu: ${errorText || response.statusText}` });
          if (turnstileWidgetIdRef.current !== null && window.turnstile) {
            window.turnstile.reset(turnstileWidgetIdRef.current);
          }
          setTurnstileToken('');
        }
        setLoading(false);
      };
      reader.readAsDataURL(selectedFile);
    } catch (error) {
      setMessage({ type: 'error', text: '❌ Hata: ' + error.message });
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-8 px-4">
      <div className="max-w-md mx-auto bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-8 text-center">
          <div className="text-5xl mb-3">📄</div>
          <h1 className="text-2xl font-bold text-white">Fatura Yükleme</h1>
          <p className="text-blue-100 mt-2 text-sm">Faturanızı buradan yükleyebilirsiniz</p>
        </div>

        {/* Content */}
        <div className="p-8">
          {/* File Upload Area */}
          <div className="mb-6">
            <label htmlFor="file-upload" className="block">
              <div className="border-2 border-dashed border-blue-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition">
                <div className="text-4xl mb-3">📸</div>
                <p className="font-medium text-gray-700">Fatura Resmini Seçin</p>
                <p className="text-sm text-gray-500 mt-1">JPG, PNG, WebP formatlarında</p>
              </div>
              <input
                id="file-upload"
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
              />
            </label>
          </div>

          {/* Selected File */}
          {fileName && (
            <div className="mb-6 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-gray-700">
                <span className="font-semibold">Seçili Dosya:</span> {fileName}
              </p>
            </div>
          )}

          {/* Message */}
          {message && (
            <div className={`mb-6 p-4 rounded-lg ${
              message.type === 'success'
                ? 'bg-green-50 border border-green-200'
                : 'bg-red-50 border border-red-200'
            }`}>
              <p className={`text-sm font-medium ${
                message.type === 'success' ? 'text-green-800' : 'text-red-800'
              }`}>
                {message.text}
              </p>
            </div>
          )}

          <div className="mb-6 p-4 border border-gray-200 rounded-lg bg-gray-50">
            <label className="block text-sm font-semibold text-gray-700 mb-2">Cloudflare Doğrulaması</label>
            {turnstileSiteKey ? (
              <div ref={turnstileRef} />
            ) : (
              <p className="text-sm text-red-600">Turnstile ayarı eksik: `VITE_TURNSTILE_SITE_KEY` tanımlanmalı.</p>
            )}
          </div>

          {/* Upload Button */}
          <button
            onClick={handleUpload}
            disabled={loading || !selectedFile || !turnstileToken}
            className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-lg hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? '⏳ Yükleniyor...' : '📤 Yükle'}
          </button>

          {/* Info */}
          <div className="mt-6 p-4 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-600">
              <strong>Not:</strong> Bu sayfa müşteriler tarafından linkle erişilir. Faturanızı yükledikten sonra sistem otomatik olarak işlem yapar.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Edit() {
  const { customerId } = useParams();
  const navigate = useNavigate();
  const { themeColor } = useTheme();
  const [customer, setCustomer] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showBelgeModal, setShowBelgeModal] = useState(false);
  const [selectedBelgeData, setSelectedBelgeData] = useState(null);
  const [isResendingSms, setIsResendingSms] = useState(false);
  const [editForm, setEditForm] = useState({
    ad_soyad: '',
    telefon: '',
    marka_model: '',
    aksesuarlar: '',
    musteri_sikayeti: '',
    not: '',
    teknisyen_aciklamasi: '',
    tamir_fisi_no: '',
    status: '',
    fiyat_verilecek: false,
    belge_f: null,
    belge_g: null,
    belge_u: null,
    belge_a: null
  });

  const statusStringToId = (statusStr) => {
    const statusIds = {
      'MÜŞTERI_KABUL': 1,
      'TEKNISYENE_VERİLDİ': 2,
      'İŞLEM_BEKLİYOR': 3,
      'PARÇA_BEKLİYOR': 4,
      'MERKEZE_SEVK': 5,
      'DEĞİŞİM': 6,
      'TAMİR_TAMAMLANDI': 7,
      'TESLİM_EDİLDİ': 8,
      'İADE': 9
    };
    return statusIds[statusStr] || '';
  };

  const fetchCustomer = async () => {
    let hasChanged = false;
    try {
      const response = await fetch(`/api/musteri-kabul/${customerId}`);
      const found = response.ok ? await response.json() : null;
      if (found) {
        const nextForm = {
          ad_soyad: found.ad_soyad || '',
          telefon: found.telefon || '',
          marka_model: found.marka_model || '',
          aksesuarlar: found.aksesuarlar || '',
          musteri_sikayeti: found.musteri_sikayeti || '',
          not: found.not || '',
          teknisyen_aciklamasi: found.teknisyen_aciklamasi || '',
          tamir_fisi_no: found.tamir_fisi_no || '',
          status: statusStringToId(found.status) || '',
          fiyat_verilecek: !!found.fiyat_verilecek,
          belge_f: found.belge_f || null,
          belge_g: found.belge_g || null,
          belge_u: found.belge_u || null,
          belge_a: found.belge_a || null
        };

        setCustomer((prev) => {
          if (isSameData(prev, found)) return prev;
          hasChanged = true;
          return found;
        });

        setEditForm((prev) => {
          if (isSameData(prev, nextForm)) return prev;
          hasChanged = true;
          return nextForm;
        });
      }
    } catch (error) {
      console.error('Error fetching customer:', error);
    } finally {
      setIsLoading(false);
    }
    return hasChanged;
  };

  useEffect(() => {
    fetchCustomer();
  }, [customerId]);
  useDataRefreshListener(fetchCustomer, [customerId]);

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editForm.ad_soyad.trim()) {
      alert('Adı soyadı boş olamaz');
      return;
    }

    try {
      const response = await fetch(`/api/musteri-kabul/${customerId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm)
      });

      if (response.ok || response.status === 204) {
        alert('✅ Güncellendi');
        triggerDataRefresh();
        navigate(-1);
      } else {
        const errorText = await response.text();
        alert('❌ Güncelleme başarısız: ' + response.statusText);
      }
    } catch (error) {
      console.error('Edit error:', error);
      alert('❌ Hata: ' + error.message);
    }
  };

  const handleResendSms = async () => {
    if (!customerId || isResendingSms) return;

    setIsResendingSms(true);
    try {
      const response = await fetch(`/api/musteri-kabul/${customerId}/resend-sms`, {
        method: 'POST',
      });

      if (!response.ok) {
        const errorText = await response.text();
        alert(`❌ SMS gönderilemedi: ${errorText || response.statusText}`);
        return;
      }

      alert('✅ SMS tekrar gönderildi');
    } catch (error) {
      console.error('Resend SMS error:', error);
      alert('❌ SMS gönderimi sırasında hata oluştu');
    } finally {
      setIsResendingSms(false);
    }
  };

  const handleFiyatVerilecekChange = async (checked) => {
    if (!customerId) return;

    const previousValue = !!editForm.fiyat_verilecek;
    setEditForm((prev) => ({ ...prev, fiyat_verilecek: checked }));
    setCustomer((prev) => (prev ? { ...prev, fiyat_verilecek: checked } : prev));

    try {
      const response = await fetch(`/api/musteri-kabul/${customerId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fiyat_verilecek: checked })
      });

      if (!(response.ok || response.status === 204)) {
        setEditForm((prev) => ({ ...prev, fiyat_verilecek: previousValue }));
        setCustomer((prev) => (prev ? { ...prev, fiyat_verilecek: previousValue } : prev));
        const errorText = await response.text();
        alert(`❌ Fiyat verilecek durumu kaydedilemedi: ${errorText || response.statusText}`);
        return;
      }

      triggerDataRefresh();
    } catch (error) {
      setEditForm((prev) => ({ ...prev, fiyat_verilecek: previousValue }));
      setCustomer((prev) => (prev ? { ...prev, fiyat_verilecek: previousValue } : prev));
      alert('❌ Fiyat verilecek durumu güncellenirken hata oluştu');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-6">
        <div className="animate-spin">⏳</div>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="p-6">
        <div className="text-center">
          <p className="text-gray-500">Müşteri bulunamadı</p>
          <button 
            onClick={() => navigate(-1)}
            className="mt-4 px-4 py-2 border rounded-lg hover:bg-gray-50"
          >
            Geri Dön
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <button 
          onClick={() => navigate(-1)}
          className="text-sm text-gray-600 hover:text-gray-800 mb-4 flex items-center gap-1"
        >
          <span className="material-icons text-lg">arrow_back</span>
          Geri Dön
        </button>
        <div className="flex items-center justify-start gap-3">
          <div>
            {customer.not && (
              <p className="text-red-600 text-sm mt-2">Not: {customer.not}</p>
            )}
          </div>
          <div className="flex items-center gap-2 w-full">
            <button
              type="button"
              onClick={handleResendSms}
              disabled={isResendingSms}
              className="px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isResendingSms ? 'SMS Gönderiliyor...' : 'SMS Tekrar Gönder'}
            </button>
            <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 select-none">
              <input
                type="checkbox"
                checked={!!editForm.fiyat_verilecek}
                onChange={(e) => handleFiyatVerilecekChange(e.target.checked)}
                className="w-4 h-4"
              />
              Fiyat Verilecek
            </label>
          <div className="flex gap-1.5 md:ml-auto">
            {[['F', 'belge_f'], ['G', 'belge_g'], ['Ü', 'belge_u'], ['A', 'belge_a']].map(([label, fieldName]) => (
              <div
                key={fieldName}
                className="relative w-9 h-9 rounded-full border flex items-center justify-center overflow-hidden shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                style={{ borderColor: editForm[fieldName] ? themeColor : '#d1d5db', backgroundColor: editForm[fieldName] ? 'transparent' : '#f9fafb' }}
                title={label}
                onClick={() => {
                  if (editForm[fieldName]) {
                    setSelectedBelgeData({ imageData: editForm[fieldName], type: label.charAt(0), adi: customer?.ad_soyad, customerId });
                    setShowBelgeModal(true);
                  }
                }}
              >
                {editForm[fieldName] ? (
                  <img src={editForm[fieldName]} alt={label} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-xs font-semibold" style={{ color: themeColor }}>{label}</span>
                )}
              </div>
            ))}
          </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
        <form onSubmit={handleEditSubmit}>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: themeColor }}>Adı Soyadı *</label>
              <input
                type="text"
                value={editForm.ad_soyad}
                onChange={(e) => setEditForm({ ...editForm, ad_soyad: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2"
                style={{ '--tw-ring-color': themeColor }}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: themeColor }}>Telefon</label>
              <input
                type="tel"
                value={editForm.telefon}
                onChange={(e) => setEditForm({ ...editForm, telefon: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2"
                style={{ '--tw-ring-color': themeColor }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: themeColor }}>Cihaz Marka Modeli</label>
              <input
                type="text"
                value={editForm.marka_model}
                onChange={(e) => setEditForm({ ...editForm, marka_model: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2"
                style={{ '--tw-ring-color': themeColor }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: themeColor }}>Aksesuarlar</label>
              <input
                type="text"
                value={editForm.aksesuarlar}
                onChange={(e) => setEditForm({ ...editForm, aksesuarlar: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2"
                style={{ '--tw-ring-color': themeColor }}
              />
            </div>

            {/* Belge Yükleme Alanları */}
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-3 text-center" style={{ color: themeColor }}>📄 Belgeler</label>
              <div className="flex justify-center flex-wrap gap-2">
                {[['Fatura (F)', 'belge_f'], ['Garanti (G)', 'belge_g'], ['Üretim (Ü)', 'belge_u'], ['Arıza (A)', 'belge_a']].map(([label, fieldName]) => (
                  <label key={fieldName} className="relative group">
                    <button
                      type="button"
                      className="px-3 py-1 border rounded text-sm hover:bg-gray-50 transition flex items-center gap-1"
                      style={{ borderColor: themeColor, color: themeColor }}
                      onClick={(e) => e.currentTarget.nextElementSibling.click()}
                    >
                      <span className="material-icons text-sm">attach_file</span>
                      {label}
                      {editForm[fieldName] && <span className="text-green-600 text-xs">✓</span>}
                    </button>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        
                        try {
                          const reader = new FileReader();
                          reader.onload = async (event) => {
                            const base64Data = event.target?.result;
                            setEditForm({ ...editForm, [fieldName]: base64Data });
                            
                            // Auto-save to backend
                            const response = await fetch(`/api/musteri-kabul/${customerId}`, {
                              method: 'PUT',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ [fieldName]: base64Data })
                            });
                            
                            if (response.ok || response.status === 204) {
                              console.log(`✅ ${label} kaydedildi`);
                              triggerDataRefresh();
                            }
                          };
                          reader.readAsDataURL(file);
                        } catch (error) {
                          console.error('File read error:', error);
                        }
                      }}
                    />
                  </label>
                ))}
              </div>
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium mb-2" style={{ color: themeColor }}>Müşteri Şikayeti</label>
              <textarea
                value={editForm.musteri_sikayeti}
                onChange={(e) => setEditForm({ ...editForm, musteri_sikayeti: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 resize-none"
                style={{ '--tw-ring-color': themeColor }}
                rows="3"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-2" style={{ color: themeColor }}>Teknisyen Açıklaması</label>
              <textarea
                value={editForm.teknisyen_aciklamasi}
                onChange={(e) => setEditForm({ ...editForm, teknisyen_aciklamasi: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 resize-none"
                style={{ '--tw-ring-color': themeColor }}
                rows="5"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-2" style={{ color: themeColor }}>Durum</label>
              <select
                value={editForm.status || ''}
                onChange={(e) => setEditForm({ ...editForm, status: e.target.value ? parseInt(e.target.value) : '' })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2"
                style={{ '--tw-ring-color': themeColor }}
              >
                <option value="">Durum Seçin</option>
                <option value="1">Müşteri Kabul</option>
                <option value="2">Teknisyene Verildi</option>
                <option value="3">İşlem Bekliyor</option>
                <option value="4">Parça Bekliyor</option>
                <option value="5">Merkeze Sevk</option>
                <option value="6">Değişim</option>
                <option value="7">Tamir Tamamlandı</option>
                <option value="8">Teslim Edildi</option>
                <option value="9">İade</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-2" style={{ color: themeColor }}>Tamir Fişi No</label>
              <input
                type="text"
                value={editForm.tamir_fisi_no}
                onChange={(e) => setEditForm({ ...editForm, tamir_fisi_no: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2"
                style={{ '--tw-ring-color': themeColor }}
                placeholder="Tamir fişi numarasını giriniz"
              />
            </div>

          </div>

          <div className="flex gap-2 pt-4 border-t">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition"
            >
              İptal
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 text-white rounded-lg hover:opacity-90 transition"
              style={{ backgroundColor: themeColor }}
            >
              Kaydet
            </button>
          </div>
        </form>
      </div>

      {/* Belge Modal */}
      {showBelgeModal && selectedBelgeData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full h-[90vh] flex flex-col shadow-2xl">
            <div className="p-6 border-b flex justify-between items-center">
              <h3 className="text-xl font-semibold">{selectedBelgeData.type} Belgesi - {selectedBelgeData.adi}</h3>
              <button 
                onClick={() => setShowBelgeModal(false)}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-auto flex items-center justify-center bg-gray-50 p-4">
              {selectedBelgeData.imageData ? (
                <img src={selectedBelgeData.imageData} alt={`${selectedBelgeData.type} Belgesi`} className="max-w-full max-h-full object-contain" />
              ) : (
                <p className="text-gray-500">Henüz resim yüklenmemiş</p>
              )}
            </div>

            <div className="p-6 border-t flex gap-2 justify-end">
              <button
                onClick={() => setShowBelgeModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition"
              >
                Kapat
              </button>
              {selectedBelgeData.imageData && (
                <button
                  onClick={async () => {
                    try {
                      await downloadBelgeAsCompressedJpg(selectedBelgeData);
                    } catch (error) {
                      showToast(error?.message || 'İndirme hatası', 'error');
                    }
                  }}
                  className="px-4 py-2 text-white rounded-lg hover:opacity-90 transition"
                  style={{ backgroundColor: themeColor }}
                >
                  İndir
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Ayarlar({ themeColor, setThemeColor, onlyThemeModal = false }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [showColorModal, setShowColorModal] = useState(false);
  const [showUserModal, setShowUserModal] = useState(false);
  const [adSoyad, setAdSoyad] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [userLevel, setUserLevel] = useState('level2');
  const [userSaving, setUserSaving] = useState(false);
  const [userMessage, setUserMessage] = useState(null);
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [editAdSoyad, setEditAdSoyad] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editUserLevel, setEditUserLevel] = useState('level2');
  const [themeMessage, setThemeMessage] = useState(null);
  const usersCacheRef = useRef(null);
  const usersLoadedOnceRef = useRef(false);

  const levelOptions = [
    { value: 'level1', label: 'Level 1 - Admin' },
    { value: 'level2', label: 'Level 2 - Teknisyen' },
    { value: 'level3', label: 'Level 3 - Montaj Ekibi' },
  ];

  const getLevelLabel = (level) => {
    const matched = levelOptions.find((item) => item.value === level);
    return matched?.label || 'Level 2 - Teknisyen';
  };

  const colors = [
    { name: 'Red', hex: '#F44336' },
    { name: 'Pink', hex: '#E91E63' },
    { name: 'Purple', hex: '#9C27B0' },
    { name: 'Deep Purple', hex: '#673AB7' },
    { name: 'Indigo', hex: '#3F51B5' },
    { name: 'Blue', hex: '#2196F3' },
    { name: 'Light Blue', hex: '#03A9F4' },
    { name: 'Cyan', hex: '#00BCD4' },
    { name: 'Teal', hex: '#009688' },
    { name: 'Green', hex: '#4CAF50' },
    { name: 'Light Green', hex: '#8BC34A' },
    { name: 'Lime', hex: '#CDDC39' },
    { name: 'Yellow', hex: '#FFEB3B' },
    { name: 'Amber', hex: '#FFC107' },
    { name: 'Orange', hex: '#FF9800' },
    { name: 'Deep Orange', hex: '#FF5722' },
    { name: 'Brown', hex: '#795548' },
    { name: 'Grey', hex: '#9E9E9E' },
    { name: 'Blue Grey', hex: '#607D8B' },
    { name: 'Dark Red', hex: '#C62828' },
    { name: 'Dark Pink', hex: '#AD1457' },
    { name: 'Dark Purple', hex: '#6A1B9A' },
    { name: 'Dark Teal', hex: '#00695C' },
    { name: 'Dark Green', hex: '#1B5E20' },
    { name: 'Dark Blue', hex: '#0D47A1' }
  ];

  const settings = [
    {
      id: 'tema',
      title: 'Tema Ayarları',
      description: 'Renk paletini değiştirerek arayüzü özelleştirin.',
      icon: 'palette',
      color: 'bg-pink-200'
    },
    {
      id: 'kullanici',
      title: 'Kullanıcı Ayarları',
      description: 'Yeni kullanıcı ekleyerek sisteme giriş yetkisi verin.',
      icon: 'person_add',
      color: 'bg-blue-200'
    }
  ];

  const handleColorSelect = async (hex) => {
    setThemeColor(hex);
    localStorage.setItem('themeColor', hex);
    setShowColorModal(false);
    setThemeMessage({ type: 'success', text: 'Tema rengi güncellendi.' });

    const currentUsername = (localStorage.getItem('username') || '').trim().toLowerCase();
    if (!currentUsername) return;

    try {
      const usersResponse = await fetch('/api/users');
      if (!usersResponse.ok) return;

      const usersData = await usersResponse.json();
      const currentUser = Array.isArray(usersData)
        ? usersData.find((user) => (user?.username || '').toLowerCase() === currentUsername)
        : null;

      if (!currentUser?.id) return;

      await fetch(`/api/users/${currentUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme_color: hex }),
      });
    } catch (error) {
      console.error('Theme color save error:', error);
      setThemeMessage({ type: 'error', text: 'Tema kaydedilirken bağlantı hatası oluştu.' });
    }
  };

  useEffect(() => {
    if (!themeMessage) return;

    const timer = setTimeout(() => {
      setThemeMessage(null);
    }, 2500);

    return () => clearTimeout(timer);
  }, [themeMessage]);

  const fetchUsers = async () => {
    if (!usersLoadedOnceRef.current) {
      setUsersLoading(true);
    }

    let hasChanged = false;
    try {
      const response = await fetch('/api/users');
      if (response.ok) {
        const data = await response.json();
        const normalizedData = Array.isArray(data) ? data : [];
        if (!isSameData(usersCacheRef.current, normalizedData)) {
          usersCacheRef.current = normalizedData;
          setUsers(normalizedData);
          hasChanged = true;
        }
      }
    } catch (error) {
      console.error('Users fetch error:', error);
    }
    usersLoadedOnceRef.current = true;
    setUsersLoading(false);
    return hasChanged;
  };

  useEffect(() => {
    if (onlyThemeModal) {
      setShowColorModal(true);
      setShowUserModal(false);
      return;
    }

    const params = new URLSearchParams(location.search);
    const openPanel = params.get('open');
    if (openPanel === 'tema') {
      setShowColorModal(true);
      setShowUserModal(false);
    }
  }, [location.search, onlyThemeModal]);

  const closeThemeModal = () => {
    setShowColorModal(false);
    if (onlyThemeModal) {
      navigate(-1);
    }
  };

  useEffect(() => {
    if (showUserModal) {
      fetchUsers();
    }
  }, [showUserModal]);
  useDataRefreshListener(fetchUsers, [showUserModal]);

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setUserMessage(null);

    if (!adSoyad.trim() || !username.trim() || !password.trim()) {
      setUserMessage({ type: 'error', text: 'Lütfen tüm alanları doldurun.' });
      return;
    }

    setUserSaving(true);

    try {
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ad_soyad: adSoyad,
          username: username,
          password: password,
          level: userLevel,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        setUserMessage({ type: 'error', text: errorText || 'Kullanıcı eklenemedi.' });
        setUserSaving(false);
        return;
      }

      setUserMessage({ type: 'success', text: 'Kullanıcı başarıyla eklendi.' });
      setAdSoyad('');
      setUsername('');
      setPassword('');
      setUserLevel('level2');
      fetchUsers();
    } catch (error) {
      setUserMessage({ type: 'error', text: 'Sunucu bağlantısı başarısız.' });
    }

    setUserSaving(false);
  };

  const startEditUser = (user) => {
    setEditingUser(user);
    setEditAdSoyad(user.ad_soyad || '');
    setEditUsername(user.username || '');
    setEditPassword('');
    setEditUserLevel(user.level || (user.is_root ? 'level1' : 'level2'));
    setUserMessage(null);
  };

  const handleUpdateUser = async (e) => {
    e.preventDefault();
    if (!editingUser?.id) return;

    setUserSaving(true);
    setUserMessage(null);

    try {
      const response = await fetch(`/api/users/${editingUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ad_soyad: editAdSoyad,
          username: editUsername,
          password: editPassword,
          level: editUserLevel,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        setUserMessage({ type: 'error', text: errorText || 'Kullanıcı güncellenemedi.' });
        setUserSaving(false);
        return;
      }

      setUserMessage({ type: 'success', text: 'Kullanıcı güncellendi.' });
      setEditingUser(null);
      setEditAdSoyad('');
      setEditUsername('');
      setEditPassword('');
      setEditUserLevel('level2');
      fetchUsers();
    } catch (error) {
      setUserMessage({ type: 'error', text: 'Sunucu bağlantısı başarısız.' });
    }

    setUserSaving(false);
  };

  const handleDeleteUser = async (user) => {
    if (!user?.id || user.is_root) return;

    const confirmed = window.confirm(`${user.username} kullanıcısı silinsin mi?`);
    if (!confirmed) return;

    if (!confirmMathDelete()) return;

    setUserSaving(true);
    setUserMessage(null);

    try {
      const response = await fetch(`/api/users/${user.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorText = await response.text();
        setUserMessage({ type: 'error', text: errorText || 'Kullanıcı silinemedi.' });
        setUserSaving(false);
        return;
      }

      setUserMessage({ type: 'success', text: 'Kullanıcı silindi.' });
      if (editingUser?.id === user.id) {
        setEditingUser(null);
      }
      fetchUsers();
    } catch (error) {
      setUserMessage({ type: 'error', text: 'Sunucu bağlantısı başarısız.' });
    }

    setUserSaving(false);
  };

  return (
    <>
    {!onlyThemeModal && (
    <div className="p-6">
      <div className="mb-8">
        <p className="text-sm text-gray-500 uppercase tracking-wide">Yönetim</p>
        <h2 className="text-4xl font-bold text-gray-900 mb-2">Ayarlar</h2>
        <p className="text-gray-600">Kullanıcı yönetimi, tema ayarları ve veri aktarımı işlemlerini yönetin.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
        {settings.map((setting) => (
          <div
            key={setting.id}
            onClick={() => {
              if (setting.id === 'tema') {
                setShowColorModal(true);
              }
              if (setting.id === 'kullanici') {
                setUserMessage(null);
                setShowUserModal(true);
              }
            }}
            className="bg-white border border-gray-200 rounded-xl p-6 transition-shadow hover:shadow-lg cursor-pointer"
          >
            <div className="flex items-start gap-4">
              <div className={`${setting.color} rounded-lg p-3 flex-shrink-0`}>
                <span className="material-icons text-2xl text-gray-700">{setting.icon}</span>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{setting.title}</h3>
                <p className="text-gray-600 text-sm">{setting.description}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
      </div>
      )}

      {/* Color Modal */}
      {showColorModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-2xl w-full max-h-96 overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900">Renk Seçin</h2>
              <button
                  onClick={closeThemeModal}
                className="text-gray-400 hover:text-gray-600"
              >
                <span className="material-icons">close</span>
              </button>
            </div>

            <div className="grid grid-cols-5 gap-4">
              {colors.map((color) => (
                <div
                  key={color.hex}
                  onClick={() => handleColorSelect(color.hex)}
                  className="flex flex-col items-center cursor-pointer hover:scale-110 transition-transform"
                  title={color.name}
                >
                  <div
                    className={`w-16 h-16 rounded-lg border-4 ${themeColor === color.hex ? 'border-gray-900' : 'border-gray-300'} hover:border-gray-600`}
                    style={{ backgroundColor: color.hex }}
                  />
                  <p className="text-xs text-gray-700 mt-2 text-center">{color.name}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* User Modal */}
      {showUserModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-3xl w-full max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900">Kullanıcı Ayarları</h2>
              <button
                onClick={() => setShowUserModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <span className="material-icons">close</span>
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">İsim Soyisim</label>
                <input
                  type="text"
                  value={adSoyad}
                  onChange={(e) => setAdSoyad(e.target.value)}
                  placeholder="Örn: Ahmet Yılmaz"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Kullanıcı Adı</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Örn: ahmet"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Şifre</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Şifre girin"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Seviye</label>
                <select
                  value={userLevel}
                  onChange={(e) => setUserLevel(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200"
                >
                  {levelOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-3 flex items-center gap-3 mt-1">
                <button
                  type="submit"
                  disabled={userSaving}
                  className="px-4 py-2 rounded-lg text-white font-medium disabled:opacity-60"
                  style={{ backgroundColor: themeColor }}
                >
                  {userSaving ? 'Kaydediliyor...' : 'Kullanıcı Ekle'}
                </button>

                <button
                  type="button"
                  onClick={fetchUsers}
                  className="px-3 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
                >
                  Yenile
                </button>

                {userMessage && (
                  <p className={`text-sm ${userMessage.type === 'success' ? 'text-green-700' : 'text-red-600'}`}>
                    {userMessage.text}
                  </p>
                )}
              </div>
            </form>

            <div className="mt-8">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Kayıtlı Kullanıcılar</h3>
              {usersLoading ? (
                <p className="text-sm text-gray-500">Kullanıcılar yükleniyor...</p>
              ) : users.length === 0 ? (
                <p className="text-sm text-gray-500">Henüz kayıtlı kullanıcı yok.</p>
              ) : (
                <div className="overflow-x-auto border border-gray-200 rounded-lg">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-700">
                      <tr>
                        <th className="text-left px-4 py-3 font-semibold">İsim Soyisim</th>
                        <th className="text-left px-4 py-3 font-semibold">Kullanıcı Adı</th>
                        <th className="text-left px-4 py-3 font-semibold">Seviye</th>
                        <th className="text-left px-4 py-3 font-semibold">Oluşturulma</th>
                        <th className="text-left px-4 py-3 font-semibold">İşlem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((user, index) => (
                        <tr key={user.id || user.username || index} className="border-t border-gray-100">
                          <td className="px-4 py-3 text-gray-900">{user.ad_soyad}</td>
                          <td className="px-4 py-3 text-gray-700">{user.username}</td>
                          <td className="px-4 py-3 text-gray-700">{user.level_label || getLevelLabel(user.level)}</td>
                          <td className="px-4 py-3 text-gray-600">
                            {user.created_at_ms ? new Date(user.created_at_ms).toLocaleString('tr-TR') : '-'}
                          </td>
                          <td className="px-4 py-3 text-gray-600">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => startEditUser(user)}
                                className="px-2 py-1 text-xs rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
                              >
                                Ayarla
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteUser(user)}
                                disabled={user.is_root || userSaving}
                                className="px-2 py-1 text-xs rounded border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                Sil
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {editingUser && (
                <form onSubmit={handleUpdateUser} className="mt-6 p-4 border border-gray-200 rounded-lg bg-gray-50">
                  <h4 className="text-base font-semibold text-gray-900 mb-3">Kullanıcı Düzenle: {editingUser.username}</h4>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">İsim Soyisim</label>
                      <input
                        type="text"
                        value={editAdSoyad}
                        onChange={(e) => setEditAdSoyad(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Kullanıcı Adı</label>
                      <input
                        type="text"
                        value={editUsername}
                        onChange={(e) => setEditUsername(e.target.value)}
                        disabled={editingUser.is_root}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:bg-gray-100 disabled:text-gray-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Şifre (opsiyonel)</label>
                      <input
                        type="password"
                        value={editPassword}
                        onChange={(e) => setEditPassword(e.target.value)}
                        placeholder="Boş bırakırsan değişmez"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Seviye</label>
                      <select
                        value={editUserLevel}
                        onChange={(e) => setEditUserLevel(e.target.value)}
                        disabled={editingUser.is_root}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:bg-gray-100 disabled:text-gray-500"
                      >
                        {levelOptions.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      type="submit"
                      disabled={userSaving}
                      className="px-4 py-2 rounded-lg text-white font-medium disabled:opacity-60"
                      style={{ backgroundColor: themeColor }}
                    >
                      {userSaving ? 'Güncelleniyor...' : 'Kaydet'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingUser(null)}
                      className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100"
                    >
                      Vazgeç
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {themeMessage && (
        <div className="fixed bottom-4 right-4 z-[70]">
          <div className={`px-4 py-2 rounded-lg shadow-lg text-sm font-medium ${themeMessage.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
            {themeMessage.text}
          </div>
        </div>
      )}

    </>
  );
}

function Layout({ themeColor, setThemeColor }) {
  const [showBelgeModal, setShowBelgeModal] = useState(false);
  const [selectedBelgeData, setSelectedBelgeData] = useState(null);
  const location = useLocation();
  const userLevel = (localStorage.getItem('level') || '').trim().toLowerCase();
  const isMontajTeam = userLevel === 'level3';
  const mobileSquareButtonClass = 'flex flex-col items-center justify-center w-16 h-16 rounded-xl text-white hover:opacity-80';
  
  // Hide sidebar and navbar on login and invoice upload pages
  const isLoginPage = location.pathname === '/login';
  const isInvoiceUploadPage = location.pathname.startsWith('/fatura/');
  const hideNavigation = isLoginPage || isInvoiceUploadPage;

  useEffect(() => {
    initFlowbite();
  }, [])

  return (
    <div className="antialiased bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Desktop Sidebar - Hide on login */}
      {!hideNavigation && (
      <aside id="logo-sidebar" className="hidden sm:flex fixed top-0 left-0 z-40 w-24 h-screen transition-transform flex-col" aria-label="Sidebar">
         <div className="h-full px-2 py-3 flex flex-col" style={{backgroundColor: `${themeColor}12`}}>
            <ul className="space-y-2 font-medium flex-1 overflow-y-auto">
               {isMontajTeam ? (
                 <MenuItem 
                   to="/cihaz_kurulum" 
                   label="Kurulum" 
                   themeColor={themeColor}
                   iconName="local_shipping"
                 />
               ) : (
                 <>
                   <MenuItem 
                     to="/" 
                     label="Anasayfa" 
                     themeColor={themeColor}
                     iconName="home"
                   />
                   
                   <MenuItem 
                     to="/musteri/kabul" 
                     label="Müşteri" 
                     themeColor={themeColor}
                     iconName="person_add"
                   />
                   
                   <MenuItem 
                     to="/montaj/ekle" 
                     label="Montaj" 
                     themeColor={themeColor}
                     iconName="local_shipping"
                   />
                   
                   <MenuItem 
                     to="/irsaliye/olustur" 
                     label="İrsaliye" 
                     themeColor={themeColor}
                     iconName="edit"
                   />
                 </>
               )}
            </ul>
            <ul className="space-y-2 font-medium">
               {!isMontajTeam && (
                 <MenuItem 
                   to="/ayarlar" 
                   label="Ayarlar" 
                   themeColor={themeColor}
                   iconName="settings"
                 />
               )}
               <MenuItem 
                 to="/logout" 
                 label="Çıkış" 
                 themeColor={themeColor}
                 iconName="power_settings_new"
                 isLogout={true}
               />
            </ul>
         </div>
      </aside>
      )}

      {/* Mobile Bottom Navigation - Hide on login */}
      {!hideNavigation && (
      <nav className="fixed bottom-0 left-0 right-0 sm:hidden bg-white border-t border-gray-200 px-2 py-2 z-40" style={{backgroundColor: themeColor}}>
         <ul className="flex justify-around items-center">
            {isMontajTeam ? (
              <li>
                <Link to="/cihaz_kurulum" className={mobileSquareButtonClass}>
                  <span className="material-icons text-xl">local_shipping</span>
                  <span className="text-xs mt-0.5">Kurulum</span>
                </Link>
              </li>
            ) : (
              <>
                <li>
                  <Link to="/" className="flex flex-col items-center p-2 rounded-lg text-white hover:opacity-80">
                    <span className="material-icons text-xl">home</span>
                    <span className="text-xs mt-0.5">Anasayfa</span>
                  </Link>
                </li>
                <li>
                  <Link to="/musteri/kabul" className="flex flex-col items-center p-2 rounded-lg text-white hover:opacity-80">
                    <span className="material-icons text-xl">person_add</span>
                    <span className="text-xs mt-0.5">Müşteri</span>
                  </Link>
                </li>
                <li>
                  <Link to="/montaj/ekle" className="flex flex-col items-center p-2 rounded-lg text-white hover:opacity-80">
                    <span className="material-icons text-xl">local_shipping</span>
                    <span className="text-xs mt-0.5">Montaj</span>
                  </Link>
                </li>
                <li>
                  <Link to="/tema" className="flex flex-col items-center p-2 rounded-lg text-white hover:opacity-80">
                    <span className="material-icons text-xl">brush</span>
                    <span className="text-xs mt-0.5">Tema</span>
                  </Link>
                </li>
              </>
            )}
            <li>
              <Link to="/logout" className={isMontajTeam ? mobileSquareButtonClass : 'flex flex-col items-center p-2 rounded-lg text-white hover:opacity-80'}>
                <span className="material-icons text-xl">power_settings_new</span>
                <span className="text-xs mt-0.5">Çıkış</span>
              </Link>
            </li>
         </ul>
      </nav>
      )}

      <div className={`${hideNavigation ? '' : 'p-4 sm:ml-24 sm:pb-4 pb-24'}`}>
         <Routes>
           <Route path="/login" element={<Login />} />
           <Route path="/logout" element={<Logout />} />
           <Route path="/" element={<PrivateRoute><Home /></PrivateRoute>} />
           <Route path="/status/:status" element={<PrivateRoute><StatusList showBelgeModal={showBelgeModal} setShowBelgeModal={setShowBelgeModal} selectedBelgeData={selectedBelgeData} setSelectedBelgeData={setSelectedBelgeData} /></PrivateRoute>} />
           <Route path="/edit/:customerId" element={<PrivateRoute><Edit /></PrivateRoute>} />
           <Route path="/musteri/kabul" element={<PrivateRoute><MusteriKabul showBelgeModal={showBelgeModal} setShowBelgeModal={setShowBelgeModal} selectedBelgeData={selectedBelgeData} setSelectedBelgeData={setSelectedBelgeData} /></PrivateRoute>} />
           <Route path="/musteri/montaj" element={<PrivateRoute><MusteriMontaj /></PrivateRoute>} />
           <Route path="/montaj/ekle" element={<PrivateRoute><MontajEkle /></PrivateRoute>} />
           <Route path="/monta-ekle" element={<PrivateRoute><MontaEklePage /></PrivateRoute>} />
           <Route path="/montaj/listele" element={<PrivateRoute><MontajListele /></PrivateRoute>} />
           <Route path="/cihaz_kurulum" element={<PrivateRoute><CihazKurulum /></PrivateRoute>} />
           <Route path="/irsaliye/olustur" element={<PrivateRoute><IrsaliyeOlustur /></PrivateRoute>} />
           <Route path="/irsaliye/listesi" element={<PrivateRoute><IrsaliyeListesi /></PrivateRoute>} />
           <Route path="/ayarlar" element={<PrivateRoute><Ayarlar themeColor={themeColor} setThemeColor={setThemeColor} /></PrivateRoute>} />
           <Route path="/tema" element={<PrivateRoute><Ayarlar themeColor={themeColor} setThemeColor={setThemeColor} onlyThemeModal={true} /></PrivateRoute>} />
           <Route path="/fatura/:customerId" element={<FaturaYukle />} />
         </Routes>

        {/* Belge Modal */}
        {showBelgeModal && selectedBelgeData && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl max-w-6xl w-full h-[90vh] flex flex-col shadow-2xl">
              <div className="p-6 border-b flex justify-between items-center">
                {(() => {
                  const typeMap = { 'F': 'Fatura Resmi', 'G': 'Garanti Resmi', 'Ü': 'Üretim Resmi', 'A': 'Arıza Resmi' };
                  return <h3 className="text-xl font-semibold">{typeMap[selectedBelgeData.type] || 'Belgesi Görseli'}</h3>;
                })()}
                <div className="flex gap-2 flex-wrap">
                  {selectedBelgeData.imageData && (
                    <button
                      onClick={async () => {
                        try {
                          await downloadBelgeAsCompressedJpg(selectedBelgeData);
                        } catch (error) {
                          showToast(error?.message || 'İndirme hatası', 'error');
                        }
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition"
                    >
                      <span className="material-icons text-lg">download</span>
                      <span>İndir</span>
                    </button>
                  )}

                  {/* Upload buttons for each document type */}
                  {[['F', 'belge_f'], ['G', 'belge_g'], ['Ü', 'belge_u'], ['A', 'belge_a']].map(([letter, field]) => (
                    <label key={letter} className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition cursor-pointer">
                      <span className="material-icons text-lg">upload</span>
                      <span>{letter}</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file || !selectedBelgeData) return;
                          
                          try {
                            const reader = new FileReader();
                            reader.onload = async (event) => {
                              const base64Data = event.target?.result;
                              const response = await fetch(`/api/musteri-kabul/${selectedBelgeData.customerId}`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ [field]: base64Data })
                              });
                              
                              if (response.ok || response.status === 204) {
                                setSelectedBelgeData((prev) => prev ? { ...prev, imageData: base64Data, type: letter } : prev);
                                triggerDataRefresh();
                                alert(`✅ ${letter} belgesi yüklendi!`);
                                setShowBelgeModal(false);
                              } else {
                                alert('❌ Yükleme başarısız');
                              }
                            };
                            reader.readAsDataURL(file);
                          } catch (error) {
                            console.error('Upload error:', error);
                            alert('❌ Yükleme hatası');
                          }
                        }}
                      />
                    </label>
                  ))}

                  <button 
                    onClick={() => setShowBelgeModal(false)}
                    className="text-gray-500 hover:text-gray-700 text-2xl ml-auto"
                  >
                    ✕
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-auto flex items-center justify-center p-6">
                {selectedBelgeData.imageData ? (
                  <img src={selectedBelgeData.imageData} alt="Belgesi" className="max-w-full max-h-full object-contain" />
                ) : (
                  <div className="flex flex-col items-center justify-center text-gray-400">
                    <span className="material-icons text-6xl mb-4">image_not_supported</span>
                    <p className="text-lg font-medium">Henüz resim yüklenmemiş</p>
                    <p className="text-sm mt-2">Yukarıdan bir belge yükleyin</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function App() {
  const [themeColor, setThemeColor] = useState(() => {
    return localStorage.getItem('themeColor') || '#2196F3';
  });
  const [toasts, setToasts] = useState([]);

  const pushToast = (message, type = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 3500);
  };

  useEffect(() => {
    toastDispatcher = pushToast;
    const originalAlert = window.alert;
    window.alert = (message) => {
      showToast(message);
    };

    return () => {
      toastDispatcher = null;
      window.alert = originalAlert;
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('themeColor', themeColor);
  }, [themeColor]);

  useEffect(() => {
    let isCancelled = false;
    let reconnectTimer;
    let socket;

    const connectLiveSocket = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const socketUrl = `${protocol}://${window.location.host}/api/live/ws`;

      socket = new WebSocket(socketUrl);

      socket.onmessage = () => {
        triggerDataRefresh();
      };

      socket.onerror = () => {
        try {
          socket.close();
        } catch {
          // noop
        }
      };

      socket.onclose = () => {
        if (isCancelled) return;
        reconnectTimer = setTimeout(connectLiveSocket, 1500);
      };
    };

    connectLiveSocket();

    return () => {
      isCancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
        socket.close();
      }
    };
  }, []);

  return (
    <ThemeContext.Provider value={{ themeColor, setThemeColor }}>
      <Router>
        <Layout themeColor={themeColor} setThemeColor={setThemeColor} />
      </Router>
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[80] flex flex-col gap-2 w-[92vw] max-w-md pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white transition-all duration-300 ${
              toast.type === 'success'
                ? 'bg-green-600'
                : toast.type === 'error'
                ? 'bg-red-600'
                : toast.type === 'warning'
                ? 'bg-amber-500'
                : 'bg-gray-800'
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ThemeContext.Provider>
  )
}

export default App
