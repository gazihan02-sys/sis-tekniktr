import { useEffect, useState, createContext, useContext, useRef } from 'react'
import { initFlowbite } from 'flowbite'
import { BrowserRouter as Router, Routes, Route, Link, useLocation, useNavigate, useParams, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Spor from './pages/Spor'

// Create Theme Context
const ThemeContext = createContext();

const useTheme = () => useContext(ThemeContext);
const DATA_REFRESH_EVENT = 'sis:data-refresh';

const triggerDataRefresh = () => {
  window.dispatchEvent(new Event(DATA_REFRESH_EVENT));
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

// Menu Item Component - MD3 Style
function MenuItem({ to, iconName, label, children, themeColor, isLogout, horizontal }) {
  const location = useLocation();
  const isActive = location.pathname.startsWith(to) && to !== '/';
  const [isOpen, setIsOpen] = useState(false);
  
  // Horizontal (Top Bar) Item - MD3 Navigation Rail/Bar style adapted for horizontal
  if (horizontal) {
    return (
      <li>
        <Link 
          to={to} 
          className={`
            relative flex items-center gap-2 px-4 py-0 h-12 rounded-full transition-all duration-200
            ${isActive ? 'font-bold' : 'font-medium text-gray-600 hover:bg-gray-100'}
          `}
          style={isActive ? { 
            backgroundColor: themeColor, 
            color: 'white',
            boxShadow: '0 1px 3px rgba(0,0,0,0.12)'
          } : {}}
        >
           {/* Icon Container with subtle active state backing if needed */}
          <span className="material-icons text-[20px]">
            {iconName}
          </span>
          <span className="text-sm tracking-wide">{label}</span>
          
          {/* Active Indicator (Bottom border backup design, but we use Pill for MD3) */}
        </Link>
      </li>
    );
  }

  // Vertical Layout (Legacy/Mobile Drawer)
  if (children) {
    return (
      <li>
        <button 
          onClick={() => setIsOpen(!isOpen)}
          className={`flex flex-col items-center justify-center w-full p-2 rounded-2xl group text-center transition-all duration-200`}
          style={isOpen ? { backgroundColor: themeColor + '20', color: themeColor } : { color: '#4B5563' }}
        >
          <span className="material-icons text-xl block mx-auto mb-0.5">
            {iconName}
          </span>
          <span className="whitespace-nowrap font-medium text-xs leading-tight">{label}</span>
          <span className={`material-icons transition-transform text-xs mt-0.5 ${isOpen ? 'rotate-180' : ''}`}>expand_more</span>
        </button>
        {isOpen && (
          <ul className="space-y-1 mt-2 bg-gray-50 rounded-xl p-2 animate-fadeIn">
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
         className={`flex flex-col items-center justify-center w-full p-2 rounded-2xl group text-center transition-all duration-200 active:scale-95`}
         style={isActive ? { backgroundColor: themeColor, color: 'white', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' } : { color: '#4B5563' }}
       >
         <span className="material-icons text-xl block mx-auto mb-0.5">
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
    <div className="pt-2 sm:pt-4">
       {successMessage && (
         <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl shadow-sm flex items-start gap-3">
             <span className="material-icons text-green-600">check_circle</span>
             <div className="flex-1">
               <p className="text-green-800 font-medium whitespace-pre-wrap">{successMessage}</p>
             </div>
             <button 
               onClick={() => setSuccessMessage(null)}
               className="text-green-600 hover:text-green-800 p-1 rounded-full hover:bg-green-100 transition-colors"
             >
               <span className="material-icons text-sm">close</span>
             </button>
        </div>
      )}

       {/* MD3 Search Bar */}
       <div className="mb-8 max-w-2xl mx-auto">
         <div className="relative group">
           <div className="absolute left-4 top-1/2 transform -translate-y-1/2 flex items-center pointer-events-none text-gray-500 group-focus-within:text-primary transition-colors">
              <span className="material-icons">search</span>
           </div>
           
           <input
             type="text"
             placeholder={searchPlaceholder}
             value={searchText}
             onChange={(e) => setSearchText(e.target.value)}
             className="w-full pl-12 pr-12 py-3.5 bg-gray-100 border-none rounded-full text-base focus:ring-2 focus:ring-primary/20 focus:bg-white transition-all shadow-sm hover:shadow-md focus:shadow-lg"
           />
           
           {searchText && (
             <button
               onClick={() => setSearchText('')}
               className="absolute right-3 top-1/2 transform -translate-y-1/2 p-2 rounded-full hover:bg-gray-200 text-gray-500 hover:text-gray-700 transition"
             >
               <span className="material-icons text-lg">close</span>
             </button>
           )}

           {/* Search Results Dropdown (MD3 Menu) */}
           {searchText && searchResults.length > 0 && (
             <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-xl overflow-hidden z-50 animate-fadeIn border border-gray-100">
               <div className="py-2 max-h-96 overflow-y-auto">
                  {searchResults.map((customer) => (
                    <div
                      key={customer.id}
                      onClick={() => {
                        handleSearchResultClick(customer.id);
                        setSearchText('');
                      }}
                      className="px-4 py-3 hover:bg-surface-container-high cursor-pointer transition-colors border-b border-gray-50 last:border-0"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-gray-900">{customer.ad_soyad}</p>
                          <div className="flex gap-3 mt-0.5 text-sm text-gray-500">
                             <span>{customer.telefon || '-'}</span>
                             <span>•</span>
                             <span>{customer.marka_model || '-'}</span>
                          </div>
                        </div>
                        <span className="material-icons text-gray-400">chevron_right</span>
                      </div>
                      
                      <div className="mt-2 flex items-center gap-2">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700">
                          {getStatusDisplayName(customer.status)}
                        </span>
                        {getDaysSinceCreated(customer.created_at) !== null && (
                          <span className="text-[10px] text-red-600 font-bold bg-red-50 px-1.5 py-0.5 rounded">
                            {getDaysSinceCreated(customer.created_at)} gün
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
               </div>
             </div>
           )}

           {/* No Results */}
           {searchText && searchResults.length === 0 && (
             <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-xl p-6 z-50 text-center border border-gray-100">
               <span className="material-icons text-4xl text-gray-300 mb-2">search_off</span>
               <p className="text-gray-500 text-sm">Müşteri bulunamadı</p>
             </div>
           )}
         </div>
       </div>
       
       {/* Cards Grid */}
       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
         {statusCards.map((card) => (
           <div 
             key={card.id}
             onClick={() => handleCardClick(card.statusId)}
             className="group relative bg-white rounded-2xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-all duration-300 cursor-pointer overflow-hidden"
           >
             <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity transform group-hover:scale-110 duration-500">
                <span className="material-icons text-8xl" style={{ color: themeColor }}>{card.icon}</span>
             </div>
             
             <div className="relative z-10 flex flex-col h-full justify-between">
               <div className="flex items-center gap-3 mb-4">
                 <div className="p-3 rounded-xl bg-gray-50 group-hover:bg-white transition-colors shadow-inner">
                   <span className="material-icons text-2xl" style={{ color: themeColor }}>{card.icon}</span>
                 </div>
                 <h3 className="font-medium text-gray-700 text-lg group-hover:text-gray-900 transition-colors">{card.label}</h3>
               </div>
               
               <div className="flex items-end justify-between">
                  <span className="text-3xl font-bold tracking-tight text-gray-900">{stats[card.statusId] ?? '-'}</span>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center bg-gray-50 text-gray-400 group-hover:bg-primary group-hover:text-white transition-all">
                    <span className="material-icons text-sm">arrow_forward</span>
                  </div>
               </div>
             </div>
             
             {/* Bottom accent line */}
             <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-current to-transparent opacity-0 group-hover:opacity-30 transition-opacity" style={{ color: themeColor }}></div>
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
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const statusListCacheRef = useRef(null);
  const hasLoadedOnceRef = useRef(false);
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

  const fetchStatusList = async () => {
    if (!hasLoadedOnceRef.current) {
      setIsLoading(true);
    }

    let hasChanged = false;
    try {
      const response = await fetch(`/api/musteri-kabul/by-status/${status}`);
      const data = await response.json();
      const normalizedData = Array.isArray(data) ? data : [];
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
  }, [status]);

  useEffect(() => {
    setSelectedIds((prev) => prev.filter((id) => statusList.some((item) => item.id === id)));
  }, [statusList]);

  useEffect(() => {
    setSelectedIds([]);
    setTargetStatusId('');
    setShowBulkActions(false);
  }, [status]);

  useDataRefreshListener(fetchStatusList, [status]);
  
  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <button 
          onClick={() => navigate('/')}
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-600 transition-colors"
        >
          <span className="material-icons">arrow_back</span>
        </button>
        <div className="flex flex-col">
          <span className="text-sm font-medium text-gray-500">Durum Listesi</span>
          <h2 className="text-2xl font-bold text-gray-900">{getStatusLabel(status)}</h2>
        </div>
      </div>
      
      {isLoading ? (
        <div className="flex justify-center items-center h-64">
           <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      ) : statusList.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 bg-gray-50 rounded-2xl border border-dashed border-gray-300">
          <span className="material-icons text-4xl text-gray-300 mb-2">folder_off</span>
          <p className="text-gray-500 font-medium">Bu durumda kayıt bulunamadı</p>
        </div>
      ) : (
        <>
          {/* Desktop Table - MD3 Style */}
          <div className="hidden md:block bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <th className="px-6 py-4 w-16 text-center">
                      <div className="flex items-center justify-center">
                         <input
                          type="checkbox"
                          checked={allVisibleSelected}
                          onChange={toggleSelectAll}
                          className="w-5 h-5 rounded border-gray-300 text-primary focus:ring-primary/25 cursor-pointer"
                        />
                      </div>
                    </th>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-gray-500">Müşteri Bilgisi</th>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-gray-500">İletişim</th>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-gray-500">Cihaz</th>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-gray-500">Belgeler</th>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-gray-500 text-center">İşlemler</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {statusList.map((item) => (
                    <tr key={item.id} className="group hover:bg-gray-50/80 transition-colors">
                      <td className="px-6 py-4 text-center">
                         <div className="flex items-center justify-center">
                           <input
                            type="checkbox"
                            checked={selectedIds.includes(item.id)}
                            onChange={() => toggleSingleSelect(item.id)}
                            className="w-5 h-5 rounded border-gray-300 text-primary focus:ring-primary/25 cursor-pointer"
                          />
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg">
                            {item.ad_soyad?.charAt(0) || '?'}
                          </div>
                          <div>
                            <div className="font-semibold text-gray-900">{item.ad_soyad}</div>
                            <div className="text-xs text-gray-500 font-medium mt-0.5 flex items-center gap-1">
                              <span className="material-icons text-[14px]">calendar_today</span>
                              {new Date(item.created_at).toLocaleDateString('tr-TR')}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-700 bg-gray-100 px-2 py-1 rounded-md font-mono">{item.telefon || '-'}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm font-medium text-gray-800">{item.marka_model || '-'}</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-1.5">
                          {[['F', 'belge_f'], ['G', 'belge_g'], ['Ü', 'belge_u'], ['A', 'belge_a']].map(([letter, field]) => {
                            const hasBelge = item[field] ? true : false;
                            const handleBelgeClick = () => {
                              setSelectedBelgeData({ imageData: item[field] || null, type: letter, adi: item.ad_soyad, customerId: item.id });
                              setShowBelgeModal(true);
                            };
                            return (
                              <button 
                                key={letter}
                                onClick={handleBelgeClick}
                                disabled={!hasBelge}
                                className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold transition-all ${
                                  hasBelge 
                                    ? 'bg-secondary-container text-on-surface hover:bg-secondary/20 shadow-sm' 
                                    : 'bg-gray-100 text-gray-300 cursor-default'
                                }`}
                                title={hasBelge ? `${letter} Gör` : 'Yok'}
                              >
                                {letter}
                              </button>
                            );
                          })}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex justify-center items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => handleEdit(item)} className="w-10 h-10 rounded-full hover:bg-blue-50 text-blue-600 flex items-center justify-center transition-colors" title="Düzenle">
                            <span className="material-icons text-[20px]">edit</span>
                          </button>
                          <button onClick={() => handlePrintRepairSlip(item)} className="w-10 h-10 rounded-full hover:bg-green-50 text-green-600 flex items-center justify-center transition-colors" title="Yazdır">
                            <span className="material-icons text-[20px]">print</span>
                          </button>
                          <button onClick={() => handleDelete(item.id, item.ad_soyad)} className="w-10 h-10 rounded-full hover:bg-red-50 text-red-600 flex items-center justify-center transition-colors" title="Sil">
                            <span className="material-icons text-[20px]">delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {/* Bulk Actions Footer - Desktop */}
            {selectedIds.length > 0 && (
              <div className="bg-primary/5 border-t border-primary/10 p-4 flex items-center justify-between animate-fadeIn">
                 <div className="flex items-center gap-4">
                    <span className="text-sm font-medium text-primary bg-white px-3 py-1 rounded-full shadow-sm">{selectedIds.length} kayıt seçildi</span>
                    <button onClick={() => setSelectedIds([])} className="text-sm text-gray-500 hover:text-gray-900 underline">Temizle</button>
                 </div>
                 
                 <div className="flex items-center gap-3">
                    <select
                      value={targetStatusId}
                      onChange={(e) => setTargetStatusId(e.target.value)}
                      className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:outline-none"
                    >
                      <option value="">Hedef statü seçin...</option>
                      {Object.entries(statusMap)
                        .filter(([id]) => Number(id) !== currentStatusId)
                        .map(([id, label]) => (
                          <option key={id} value={id}>{label}</option>
                        ))}
                    </select>
                    
                    <button
                      onClick={handleBulkStatusMove}
                      disabled={!targetStatusId || isBulkMoving}
                      className="flex items-center gap-2 px-5 py-2 bg-primary text-white rounded-full text-sm font-medium hover:shadow-lg hover:shadow-primary/30 disabled:opacity-50 disabled:shadow-none transition-all"
                    >
                      {isBulkMoving ? 'İşleniyor...' : 'Durumu Değiştir'}
                    </button>
                    
                    <div className="w-px h-6 bg-gray-300 mx-2"></div>
                    
                    <button
                      onClick={handleBulkDelete}
                      disabled={isBulkDeleting}
                      className="flex items-center gap-2 px-4 py-2 text-red-700 bg-red-50 hover:bg-red-100 rounded-full text-sm font-medium transition-colors"
                    >
                      <span className="material-icons text-[18px]">delete</span>
                      Sil
                    </button>
                 </div>
              </div>
            )}
          </div>

          {/* Mobile Cards - MD3 Style */}
          <div className="md:hidden space-y-4">
             {selectedIds.length > 0 && (
              <div className="sticky top-[70px] z-30 bg-surface-container-high p-4 rounded-xl shadow-md border border-gray-200 mb-6 flex flex-col gap-3 animate-slideDown">
                 <div className="flex items-center justify-between">
                    <span className="font-bold text-primary">{selectedIds.length} Seçili</span>
                    <button onClick={() => setSelectedIds([])} className="text-sm text-gray-500">Vazgeç</button>
                 </div>
                 <div className="grid grid-cols-2 gap-2">
                     <select
                        value={targetStatusId}
                        onChange={(e) => setTargetStatusId(e.target.value)}
                        className="col-span-2 px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm"
                      >
                        <option value="">Hedef...</option>
                        {Object.entries(statusMap)
                          .filter(([id]) => Number(id) !== currentStatusId)
                          .map(([id, label]) => (
                            <option key={id} value={id}>{label}</option>
                          ))}
                      </select>
                      <button 
                        onClick={handleBulkStatusMove}
                        disabled={!targetStatusId}
                        className="bg-primary text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                      >
                        Taşı
                      </button>
                      <button 
                        onClick={handleBulkDelete}
                        className="bg-red-50 text-red-700 py-2 rounded-lg text-sm font-medium border border-red-200"
                      >
                        Sil
                      </button>
                 </div>
              </div>
            )}

            {statusList.map((item) => (
              <div 
                key={item.id} 
                className={`
                  relative bg-white p-5 rounded-2xl border transition-all duration-200 shadow-sm
                  ${selectedIds.includes(item.id) 
                    ? 'border-primary ring-1 ring-primary bg-primary/5' 
                    : 'border-gray-100 hover:shadow-md'
                  }
                `}
              >
                {/* Selection Overlay */}
                <div onClick={() => toggleSingleSelect(item.id)} className="absolute inset-0 z-0"></div>
                
                <div className="relative z-10 pointer-events-none">
                  <div className="flex items-start justify-between mb-3">
                     <div className="flex items-center gap-3">
                       <div className="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center text-primary font-bold text-lg">
                          {item.ad_soyad?.charAt(0) || '?'}
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-900 text-lg leading-tight">{item.ad_soyad}</h3>
                           <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                              <span className="material-icons text-[12px]">schedule</span>
                              {new Date(item.created_at).toLocaleDateString()}
                           </p>
                        </div>
                     </div>
                     <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${selectedIds.includes(item.id) ? 'border-primary bg-primary text-white' : 'border-gray-300'}`}>
                        {selectedIds.includes(item.id) && <span className="material-icons text-[16px]">check</span>}
                     </div>
                  </div>
                  
                  <div className="space-y-2 mb-4 pl-[52px]">
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <span className="material-icons text-[18px] text-gray-400">smartphone</span>
                      <span className="font-medium">{item.marka_model || 'Model Yok'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <span className="material-icons text-[18px] text-gray-400">call</span>
                      <span className="font-mono">{item.telefon || '-'}</span>
                    </div>
                  </div>
                </div>

                <div className="relative z-20 flex items-center justify-between pt-4 border-t border-gray-100 mt-2 pl-[52px]">
                   <div className="flex gap-1">
                      {[['F', 'belge_f'], ['G', 'belge_g']].map(([letter, field]) => (
                        item[field] && (
                          <div key={letter} className="w-6 h-6 rounded bg-green-50 text-green-700 flex items-center justify-center text-[10px] font-bold border border-green-200">
                            {letter}
                          </div>
                        )
                      ))}
                   </div>
                   
                   <div className="flex gap-1">
                      <button onClick={(e) => { e.stopPropagation(); handleEdit(item); }} className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-50 text-gray-700 active:bg-gray-200">
                        <span className="material-icons text-[20px]">edit</span>
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); handlePrintRepairSlip(item); }} className="w-9 h-9 flex items-center justify-center rounded-full bg-blue-50 text-blue-700 active:bg-blue-200">
                        <span className="material-icons text-[20px]">print</span>
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); handleDelete(item.id, item.ad_soyad); }} className="w-9 h-9 flex items-center justify-center rounded-full bg-red-50 text-red-700 active:bg-red-200">
                        <span className="material-icons text-[20px]">delete</span>
                      </button>
                   </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Edit Modal (Removed / Handled by Route) */}
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
    <div className="p-4 sm:p-6 min-h-screen bg-gray-50 flex justify-center">
       <div className="w-full max-w-4xl">
         {/* Breadcrumb-ish Header */}
         <div className="flex items-center gap-4 mb-6">
           <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
             <span className="material-icons text-2xl">person_add</span>
           </div>
           <div>
             <h2 className="text-2xl font-bold text-gray-900">Müşteri Kabul</h2>
             <p className="text-sm text-gray-500">Yeni servis kaydı oluştur</p>
           </div>
           
           {/* Quick Document Status Indicators */}
           <div className="ml-auto flex gap-2">
             {[['F', 'belge_f'], ['G', 'belge_g'], ['Ü', 'belge_u'], ['A', 'belge_a']].map(([label, fieldName]) => (
               <div
                 key={fieldName}
                 className={`
                   relative w-8 h-8 rounded-lg border-2 flex items-center justify-center overflow-hidden transition-all duration-200 cursor-pointer
                   ${belgeBase64[fieldName] ? 'border-primary ring-2 ring-primary/20' : 'border-gray-200 bg-white hover:border-gray-300'}
                 `}
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
                   <span className="text-xs font-bold text-gray-400">{label}</span>
                 )}
                 {/* Success Badge */}
                 {belgeBase64[fieldName] && (
                    <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                      <span className="material-icons text-white text-sm drop-shadow-md">check</span>
                    </div>
                 )}
               </div>
             ))}
           </div>
         </div>
         
         <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 sm:p-8">
           <form onSubmit={handleSubmit} className="space-y-6">
             {/* Form Grid */}
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 {/* Ad Soyad */}
                 <div className="group">
                   <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 group-focus-within:text-primary transition-colors">Ad Soyad</label>
                   <input
                     type="text"
                     name="adSoyad"
                     value={formData.adSoyad}
                     onChange={handleChange}
                     placeholder="Ör: Ayşe Yılmaz"
                     className="w-full px-4 py-3 bg-gray-50 border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-medium text-gray-900 placeholder:text-gray-400 outline-none"
                   />
                 </div>

                 {/* Telefon */}
                 <div className="group">
                   <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 group-focus-within:text-primary transition-colors">Telefon</label>
                   <input
                     type="tel"
                     name="telefon"
                     value={formData.telefon}
                     onChange={handleChange}
                     placeholder="+90 5XX XXX XX XX"
                     className="w-full px-4 py-3 bg-gray-50 border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-mono font-medium text-gray-900 placeholder:text-gray-400 outline-none"
                   />
                 </div>

                 {/* Marka / Model */}
                 <div className="group">
                   <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 group-focus-within:text-primary transition-colors">Marka / Model</label>
                   <input
                     type="text"
                     name="markaModel"
                     value={formData.markaModel}
                     onChange={handleChange}
                     placeholder="Ör: Samsung Galaxy S22"
                     className="w-full px-4 py-3 bg-gray-50 border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-medium text-gray-900 placeholder:text-gray-400 outline-none"
                   />
                 </div>

                 {/* Aksesuarlar */}
                 <div className="group">
                   <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 group-focus-within:text-primary transition-colors">Aksesuarlar</label>
                   <input
                     type="text"
                     name="aksesuarlar"
                     value={formData.aksesuarlar}
                     onChange={handleChange}
                     placeholder="Kutu, şarj aleti, kalem vb."
                     className="w-full px-4 py-3 bg-gray-50 border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-medium text-gray-900 placeholder:text-gray-400 outline-none"
                   />
                 </div>
             </div>

             {/* Documents */}
             <div className="py-4 border-t border-b border-gray-100">
               <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-4 text-center">Belge Yükle</label>
               <div className="flex flex-wrap justify-center gap-3">
                 {[['Fatura', 'belge_f', 'description'], ['Garanti', 'belge_g', 'verified'], ['Üretim', 'belge_u', 'factory'], ['Arıza', 'belge_a', 'broken_image']].map(([label, fieldName, icon]) => (
                   <label key={fieldName} className={`cursor-pointer group flex items-center gap-2 px-4 py-2.5 rounded-full border transition-all duration-200 ${formData[fieldName] ? 'bg-primary/5 border-primary text-primary' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300'}`}>
                     <input type="file" accept="image/*" className="hidden" name={fieldName} onChange={handleFileChange} />
                     <span className={`material-icons text-[18px] ${formData[fieldName] ? 'text-primary' : 'text-gray-400 group-hover:text-gray-600'}`}>{formData[fieldName] ? 'check_circle' : icon}</span>
                     <span className="text-sm font-medium">{label}</span>
                   </label>
                 ))}
               </div>
             </div>

             {/* Full-width fields */}
             <div className="space-y-6">
                 {/* Müşteri Şikayeti */}
                 <div className="group">
                   <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 group-focus-within:text-primary transition-colors">Müşteri Şikayeti</label>
                   <textarea name="museriSikayeti" value={formData.museriSikayeti} onChange={handleChange} placeholder="Cihazın yaşadığı problemi detaylıca yazın." rows="3" className="w-full px-4 py-3 bg-gray-50 border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-medium text-gray-900 placeholder:text-gray-400 resize-none outline-none" />
                 </div>

                 {/* Not */}
                 <div className="group">
                   <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 group-focus-within:text-primary transition-colors">Not (Varsa)</label>
                   <textarea name="not" value={formData.not} onChange={handleChange} placeholder="Ek bilgi veya hatırlatmalar." rows="2" className="w-full px-4 py-3 bg-gray-50 border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-medium text-gray-900 placeholder:text-gray-400 resize-none outline-none" />
                 </div>
             </div>

             {/* Submit Button */}
             <div className="pt-4">
               <button type="submit" disabled={isLoading || isCompressing} className="w-full flex items-center justify-center gap-2 py-4 rounded-xl text-white font-bold text-lg shadow-lg shadow-primary/25 hover:shadow-primary/40 hover:-translate-y-0.5 active:translate-y-0 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none" style={{ backgroundColor: themeColor }}>
                 {isCompressing ? <><span className="animate-spin material-icons">refresh</span>Resimler Hazırlanıyor...</> : isLoading ? <><span className="animate-spin material-icons">refresh</span>Kaydediliyor...</> : <><span className="material-icons">save</span>Kaydı Oluştur</>}
               </button>
             </div>

             {/* Success/Error Message */}
             {submitMessage && (
               <div className={`mt-6 p-4 rounded-xl flex items-start gap-4 animate-fadeIn ${submitMessage.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                 <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${submitMessage.type === 'success' ? 'bg-green-100' : 'bg-red-100'}`}>
                    <span className="material-icons text-sm">{submitMessage.type === 'success' ? 'check' : 'priority_high'}</span>
                 </div>
                 <div>
                   <h4 className="font-bold text-sm mb-1">{submitMessage.title}</h4>
                   <p className="text-sm opacity-90">{submitMessage.message}</p>
                 </div>
               </div>
             )}
           </form>
         </div>
       </div>

       {/* Belge Modal */}
       {showBelgeModal && selectedBelgeData && (
         <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowBelgeModal(false)}>
           <div className="bg-white rounded-2xl max-w-2xl w-full h-[90vh] flex flex-col shadow-2xl relative overflow-hidden" onClick={e => e.stopPropagation()}>
             <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-white z-10">
               <div className="flex items-center gap-3">
                 <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                    <span className="material-icons">image</span>
                 </div>
                 <div>
                    <h3 className="text-lg font-bold text-gray-900">{selectedBelgeData.type} Belgesi</h3>
                    <p className="text-sm text-gray-500">{selectedBelgeData.adi}</p>
                 </div>
               </div>
               <button onClick={() => setShowBelgeModal(false)} className="w-8 h-8 rounded-full bg-gray-50 hover:bg-gray-100 flex items-center justify-center transition-colors">
                 <span className="material-icons text-gray-500">close</span>
               </button>
             </div>

             <div className="flex-1 overflow-auto flex items-center justify-center bg-gray-50/50 p-4">
               {selectedBelgeData.imageData ? (
                 <img src={selectedBelgeData.imageData} alt={`${selectedBelgeData.type} Belgesi`} className="max-w-full max-h-full object-contain rounded-lg shadow-sm" />
               ) : (
                 <div className="flex flex-col items-center justify-center text-gray-400">
                    <span className="material-icons text-4xl mb-2">image_not_supported</span>
                    <p>Henüz resim yüklenmemiş</p>
                 </div>
               )}
             </div>

             <div className="p-6 border-t border-gray-100 bg-white flex gap-3 justify-end items-center z-10">
               <button onClick={() => setShowBelgeModal(false)} className="px-5 py-2.5 rounded-xl text-gray-600 font-medium hover:bg-gray-50 transition-colors">Kapat</button>
               {selectedBelgeData.imageData && (
                 <button onClick={() => {
                     const link = document.createElement('a');
                     link.href = selectedBelgeData.imageData;
                     link.download = `${selectedBelgeData.adi}_${selectedBelgeData.type}_Belgesi.jpg`;
                     document.body.appendChild(link);
                     link.click();
                     document.body.removeChild(link);
                   }} className="px-5 py-2.5 rounded-xl bg-primary text-white font-medium shadow-lg shadow-primary/25 hover:shadow-primary/40 hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center gap-2">
                   <span className="material-icons text-sm">download</span> İndir
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
  const [editForm, setEditForm] = useState({
    rnuIsEmriNo: '',
    adSoyad: '',
    telefon: '',
    model: '',
    adres: '',
    servisTipi: '',
    atananKullaniciUsername: '',
  });

  const normalizePhone = (value) => {
    const cleaned = String(value || '').trim();
    if (!cleaned) return '';
    return cleaned.startsWith('0') ? cleaned : `0${cleaned}`;
  };

  const openEditModal = (item) => {
    setEditMontajId(item.id || '');
    setEditForm({
      rnuIsEmriNo: item.rnu_is_emri_no || '',
      adSoyad: item.ad_soyad || '',
      telefon: item.telefon || '',
      model: item.model || '',
      adres: item.adres || '',
      servisTipi: item.servis_tipi || '',
      atananKullaniciUsername: item.atanan_kullanici_username || '',
    });
    setShowEditModal(true);
  };

  const handleEditMontaj = async (e) => {
    e.preventDefault();

    const normalizedPhone = normalizePhone(editForm.telefon);

    if (!editForm.adSoyad.trim() || !normalizedPhone.trim() || !editForm.model.trim() || !editForm.servisTipi.trim()) {
      alert('Ad Soyad, Telefon, Model ve Servis Tipi zorunludur.');
      return;
    }

    setIsUpdating(true);
    try {
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
          atanan_kullanici_username: editForm.atananKullaniciUsername,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(errText || 'Güncelleme başarısız');
      }

      await fetchMontajList();
      setShowEditModal(false);
      setEditMontajId('');
    } catch (error) {
      console.error('Montaj update error:', error);
      alert('Kayıt güncellenemedi.');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteMontaj = async (id) => {
    const confirmed = confirm('Bu montaj kaydını silmek istediğinizden emin misiniz?');
    if (!confirmed) return;

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
                       <td className="px-6 py-4">{item.model || '-'}</td>
                       <td className="px-6 py-4">{item.servis_tipi || '-'}</td>
                       <td className="px-6 py-4">{item.atanan_kullanici_username || '-'}</td>
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
                     <div className="flex justify-between text-sm">
                       <span className="text-gray-600">Model:</span>
                       <span className="font-medium">{item.model || '-'}</span>
                     </div>
                     <div className="flex justify-between text-sm">
                       <span className="text-gray-600">Servis Tipi:</span>
                       <span className="font-medium">{item.servis_tipi || '-'}</span>
                     </div>
                     <div className="flex justify-between text-sm">
                       <span className="text-gray-600">Atanan:</span>
                       <span className="font-medium">{item.atanan_kullanici_username || '-'}</span>
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
           <div className="bg-white w-full max-w-2xl rounded-xl shadow-xl border border-gray-200 max-h-[90vh] overflow-y-auto">
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
                 <select
                   value={editForm.atananKullaniciUsername}
                   onChange={(e) => setEditForm((prev) => ({ ...prev, atananKullaniciUsername: e.target.value }))}
                   className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
                 >
                   <option value="">Atama yok</option>
                   {level3Users.map((user) => (
                     <option key={user.id || user.username} value={user.username}>{user.ad_soyad || user.username}</option>
                   ))}
                 </select>
               </div>

               <div className="md:col-span-2 flex justify-end gap-2 pt-2">
                 <button
                   type="button"
                   onClick={() => setShowEditModal(false)}
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

      window.location.href = 'https://tamir.sis-teknik.com.tr/montaj/ekle';
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
        const assigned = String(item?.atanan_kullanici_username || '').trim().toLowerCase();
        return !item?.kapatildi && assigned === currentUsername;
      }));
    } catch (error) {
      setMessage({ type: 'error', text: 'Sunucu bağlantısı başarısız.' });
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchMontaj();
  }, []);

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
    <div className="p-4 sm:p-6 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Kurulum Listesi</h2>
        <button
          type="button"
          onClick={fetchMontaj}
          className="w-10 h-10 rounded-full flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors"
        >
          <span className="material-icons">refresh</span>
        </button>
      </div>

      {message && (
        <div className={`mb-4 p-4 rounded-xl flex items-start gap-3 ${message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
           <span className="material-icons text-xl">{message.type === 'success' ? 'check_circle' : 'error'}</span>
           <p className="text-sm font-medium">{message.text}</p>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
           <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 bg-gray-50 rounded-2xl border border-dashed border-gray-300">
          <span className="material-icons text-4xl text-gray-300 mb-2">assignment_turned_in</span>
          <p className="text-gray-500 font-medium">Atanmış işiniz yok</p>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item, index) => (
            <div key={item.id || index} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <div className="flex items-start gap-4 mb-4">
                 <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xl shrink-0">
                    {item.ad_soyad?.charAt(0) || '?'}
                 </div>
                 <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-bold text-gray-900 leading-tight truncate">{item.ad_soyad || 'İsimsiz'}</h3>
                    <p className="text-sm text-gray-500 mt-0.5 truncate">{item.adres || 'Adres Girilmemiş'}</p>
                 </div>
              </div>
              
              <div className="flex flex-col gap-3 mb-5 pl-[64px]">
                 <div className="flex items-center gap-2 text-sm text-gray-700">
                    <span className="material-icons text-gray-400 text-[18px]">smartphone</span>
                    <span className="font-mono">{item.telefon || '-'}</span>
                 </div>
                 
                 <div className="flex items-center gap-2 text-sm text-gray-700">
                    <span className="material-icons text-gray-400 text-[18px]">tv</span>
                    <span className="font-medium">{item.model || '-'}</span>
                    {item.belge_f && (
                       <button
                         onClick={async () => {
                            const response = await fetch(`/api/montaj/${item.id}`);
                            if (response.ok) {
                              const fullItem = await response.json();
                              setSelectedFatura(fullItem);
                              setShowFaturaModal(true);
                            }
                         }}
                         className="ml-auto text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium flex items-center gap-1 hover:bg-green-200 transition-colors"
                       >
                         <span className="material-icons text-[14px]">receipt</span>
                         Fatura
                       </button>
                    )}
                 </div>
              </div>

              <button
                type="button"
                onClick={() => openCloseModal(item)}
                disabled={closingId === item.id || item?.kapatildi}
                className="w-full py-3 rounded-full text-white text-sm font-bold shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30 active:scale-[0.98] transition-all disabled:opacity-50 disabled:shadow-none"
                style={{ backgroundColor: themeColor }}
              >
                {closingId === item.id ? 'İşleniyor...' : 'Montajı Tamamla'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Close Modal - MD3 Style */}
      {showCloseModal && selectedMontaj && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl p-6 w-full max-w-md shadow-2xl animate-slideUp sm:animate-fadeIn">
            <div className="w-12 h-1.5 bg-gray-300 rounded-full mx-auto mb-6 sm:hidden"></div>
            
            <h3 className="text-2xl font-bold text-gray-900 mb-1">Montajı Kapat</h3>
            <p className="text-sm text-gray-500 mb-6">
              {selectedMontaj.ad_soyad} için işlem detaylarını girin.
            </p>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-3">Kurulum Tipi</label>
              <div className="grid grid-cols-2 gap-3">
                {['DUVAR', 'SEHPA'].map((tip) => (
                  <button
                    key={tip}
                    type="button"
                    onClick={() => setKurulumTipi(tip)}
                    className={`py-3 px-4 rounded-xl border-2 text-sm font-bold transition-all ${
                      kurulumTipi === tip 
                        ? 'border-primary bg-primary/5 text-primary' 
                        : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}
                  >
                    {tip === 'DUVAR' ? 'Duvar Montaj' : 'Sehpa Kurulum'}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-8">
              <label className="block text-sm font-medium text-gray-700 mb-3">Fotoğraflar</label>
              <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-300 border-dashed rounded-2xl cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors">
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      <span className="material-icons text-3xl text-gray-400 mb-2">add_a_photo</span>
                      <p className="text-sm text-gray-500">{closeFiles.length > 0 ? `${closeFiles.length} fotoğraf seçildi` : 'Fotoğraf Çek / Yükle'}</p>
                  </div>
                  <input 
                    type="file" 
                    accept="image/*" 
                    multiple 
                    className="hidden" 
                    onChange={(e) => setCloseFiles(Array.from(e.target.files || []))}
                  />
              </label>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowCloseModal(false);
                  setSelectedMontaj(null);
                  setCloseFiles([]);
                }}
                className="flex-1 py-3 rounded-full font-medium text-gray-700 hover:bg-gray-100 transition-colors"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={handleCloseMontaj}
                disabled={closingId === selectedMontaj.id}
                className="flex-1 py-3 rounded-full text-white font-bold shadow-lg shadow-primary/25 disabled:opacity-50"
                style={{ backgroundColor: themeColor }}
              >
                {closingId === selectedMontaj.id ? 'Kaydediliyor...' : 'Tamamla'}
              </button>
            </div>
            
            {closeProgressText && (
               <div className="mt-4 text-center text-sm font-medium text-primary animate-pulse">
                  {closeProgressText}
               </div>
            )}
          </div>
        </div>
      )}

      {/* Fatura Modal */}
      {showFaturaModal && selectedFatura && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setShowFaturaModal(false)}>
          <img 
            src={selectedFatura.belge_f} 
            alt="Fatura" 
            className="max-h-[85vh] max-w-full rounded-lg shadow-2xl" 
            onClick={(e) => e.stopPropagation()}
          />
          <button 
            className="absolute top-4 right-4 text-white hover:text-gray-300"
            onClick={() => setShowFaturaModal(false)}
          >
             <span className="material-icons text-3xl">close</span>
          </button>
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
      const response = await fetch(`/api/musteri-kabul`);
      const data = await response.json();
      const found = data.find(c => c.id === customerId);
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
                  onClick={() => {
                    const link = document.createElement('a');
                    link.href = selectedBelgeData.imageData;
                    link.download = `${selectedBelgeData.adi}_${selectedBelgeData.type}_Belgesi.jpg`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
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
    }
  };

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

    </>
  );
}

function Layout({ themeColor, setThemeColor }) {
  const [showBelgeModal, setShowBelgeModal] = useState(false);
  const [selectedBelgeData, setSelectedBelgeData] = useState(null);
  const location = useLocation();
  const userLevel = (localStorage.getItem('level') || '').trim().toLowerCase();
  const isMontajTeam = userLevel === 'level3';
  
  // Hide navigation on specific pages
  const isLoginPage = location.pathname === '/login';
  const isInvoiceUploadPage = location.pathname.startsWith('/fatura/');
  const hideNavigation = isLoginPage || isInvoiceUploadPage;

  useEffect(() => {
    initFlowbite();
  }, [])

  return (
    <div className="antialiased bg-stone-50 min-h-screen text-gray-900 font-sans selection:bg-purple-100 selection:text-purple-900">
      {/* Desktop Header - MD3 Top App Bar */}
      {!hideNavigation && (
      <header className="hidden sm:flex fixed top-0 left-0 right-0 z-50 h-[64px] bg-white/90 backdrop-blur-md border-b border-gray-200 transition-all shadow-sm" aria-label="Navigation">
         <div className="w-full max-w-7xl mx-auto px-6 h-full flex items-center justify-between">
            {/* Logo/Brand */}
            <div className="flex items-center gap-3">
               <div className="p-2 bg-gradient-to-tr from-purple-600 to-indigo-600 rounded-xl shadow-lg shadow-purple-200">
                 <span className="material-icons text-white text-xl">build_circle</span>
               </div>
               <span className="text-xl font-bold tracking-tight text-gray-800">
                 Teknik<span style={{ color: themeColor }}>Sis</span>
               </span>
            </div>

            {/* Navigation Items (Pill shaped) */}
            <nav className="flex-1 flex justify-center">
              <ul className="flex items-center gap-2 bg-gray-100/50 p-1 rounded-full border border-gray-200/50">
                {isMontajTeam ? (
                  <MenuItem 
                    to="/cihaz_kurulum" 
                    label="Kurulum" 
                    themeColor={themeColor}
                    iconName="local_shipping"
                    horizontal={true}
                  />
                ) : (
                  <>
                    <MenuItem 
                      to="/" 
                      label="Anasayfa" 
                      themeColor={themeColor}
                      iconName="home"
                      horizontal={true}
                    />
                    
                    <MenuItem 
                      to="/musteri/kabul" 
                      label="Müşteri" 
                      themeColor={themeColor}
                      iconName="person_add"
                      horizontal={true}
                    />
                    
                    <MenuItem 
                      to="/montaj/ekle" 
                      label="Montaj" 
                      themeColor={themeColor}
                      iconName="local_shipping"
                      horizontal={true}
                    />
                    
                    <MenuItem 
                      to="/irsaliye/olustur" 
                      label="İrsaliye" 
                      themeColor={themeColor}
                      iconName="edit"
                      horizontal={true}
                    />
                  </>
                )}
              </ul>
            </nav>

            {/* Right Menu Items (Settings/Profile) */}
            <div className="flex items-center gap-1">
               {!isMontajTeam && (
                 <Link to="/ayarlar" className="p-2 rounded-full hover:bg-gray-100 text-gray-600 transition-colors">
                   <span className="material-icons text-2xl">settings</span>
                 </Link>
               )}
               <div className="w-px h-6 bg-gray-300 mx-2"></div>
               <Link to="/logout" className="flex items-center gap-2 pl-2 pr-4 py-1.5 rounded-full hover:bg-red-50 text-red-600 transition-colors border border-transparent hover:border-red-100">
                 <span className="material-icons text-[20px]">logout</span>
                 <span className="text-sm font-medium">Çıkış</span>
               </Link>
            </div>
         </div>
      </header>
      )}

      {/* Mobile Bottom Navigation - MD3 Navigation Bar */}
      {!hideNavigation && (
      <nav className="fixed bottom-0 left-0 right-0 sm:hidden bg-surface container-elevation shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] border-t border-gray-100 z-50 h-[80px] pb-4">
         <ul className="grid grid-cols-4 h-full items-center px-2">
            {isMontajTeam ? (
              <li className="flex justify-center">
                <Link to="/cihaz_kurulum" className="flex flex-col items-center gap-1 group">
                  <div className={`w-16 h-8 rounded-full flex items-center justify-center transition-colors ${location.pathname === '/cihaz_kurulum' ? 'bg-secondary-container' : ''}`}>
                    <span className="material-icons text-2xl text-on-surface-variant">local_shipping</span>
                  </div>
                  <span className="text-xs font-medium text-on-surface-variant">Kurulum</span>
                </Link>
              </li>
            ) : (
              <>
                <li className="flex justify-center">
                  <Link to="/" className="flex flex-col items-center gap-1 group w-full">
                    <div className={`w-[64px] h-[32px] rounded-full flex items-center justify-center transition-colors ${location.pathname === '/' ? 'bg-indigo-100 text-indigo-800' : 'text-gray-500'}`} style={location.pathname === '/' ? { backgroundColor: themeColor + '30', color: themeColor } : {}}>
                      <span className="material-icons text-2xl">home</span>
                    </div>
                    <span className={`text-[11px] font-medium ${location.pathname === '/' ? 'text-gray-900' : 'text-gray-500'}`}>Anasayfa</span>
                  </Link>
                </li>
                <li className="flex justify-center">
                  <Link to="/musteri/kabul" className="flex flex-col items-center gap-1 group w-full">
                     <div className={`w-[64px] h-[32px] rounded-full flex items-center justify-center transition-colors ${location.pathname.startsWith('/musteri') ? 'bg-indigo-100 text-indigo-800' : 'text-gray-500'}`} style={location.pathname.startsWith('/musteri') ? { backgroundColor: themeColor + '30', color: themeColor } : {}}>
                      <span className="material-icons text-2xl">person_add</span>
                    </div>
                    <span className={`text-[11px] font-medium ${location.pathname.startsWith('/musteri') ? 'text-gray-900' : 'text-gray-500'}`}>Müşteri</span>
                  </Link>
                </li>
                <li className="flex justify-center">
                  <Link to="/montaj/ekle" className="flex flex-col items-center gap-1 group w-full">
                     <div className={`w-[64px] h-[32px] rounded-full flex items-center justify-center transition-colors ${location.pathname.startsWith('/montaj') ? 'bg-indigo-100 text-indigo-800' : 'text-gray-500'}`} style={location.pathname.startsWith('/montaj') ? { backgroundColor: themeColor + '30', color: themeColor } : {}}>
                      <span className="material-icons text-2xl">local_shipping</span>
                    </div>
                    <span className={`text-[11px] font-medium ${location.pathname.startsWith('/montaj') ? 'text-gray-900' : 'text-gray-500'}`}>Montaj</span>
                  </Link>
                </li>
                <li className="flex justify-center">
                  <Link to="/ayarlar" className="flex flex-col items-center gap-1 group w-full">
                     <div className={`w-[64px] h-[32px] rounded-full flex items-center justify-center transition-colors ${location.pathname.startsWith('/ayarlar') ? 'bg-indigo-100 text-indigo-800' : 'text-gray-500'}`} style={location.pathname.startsWith('/ayarlar') ? { backgroundColor: themeColor + '30', color: themeColor } : {}}>
                      <span className="material-icons text-2xl">settings</span>
                    </div>
                    <span className={`text-[11px] font-medium ${location.pathname.startsWith('/ayarlar') ? 'text-gray-900' : 'text-gray-500'}`}>Ayarlar</span>
                  </Link>
                </li>
              </>
            )}
         </ul>
      </nav>
      )}

      <div className={`transition-all duration-300 ${hideNavigation ? '' : 'pt-[80px] px-4 pb-24 sm:px-6 sm:pb-8 max-w-7xl mx-auto'}`}>
         <Routes>
           <Route path="/login" element={<Login />} />
           <Route path="/logout" element={<Logout />} />
           <Route path="/spor" element={<Spor />} />
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
                        const typeMap = { 'F': 'Fatura', 'G': 'Garanti', 'Ü': 'Üretim', 'A': 'Arıza' };
                        const turkceAd = typeMap[selectedBelgeData.type] || 'Belge';
                        const safeName = (selectedBelgeData.adi || 'Musteri').toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
                        const filename = `${safeName}_${turkceAd.toLowerCase()}.jpg`;
                        
                        try {
                          const img = new Image();
                          img.onload = () => {
                            const canvas = document.createElement('canvas');
                            canvas.width = img.width;
                            canvas.height = img.height;
                            const ctx = canvas.getContext('2d');
                            ctx.drawImage(img, 0, 0);
                            
                            canvas.toBlob(
                              (blob) => {
                                const link = document.createElement('a');
                                link.href = URL.createObjectURL(blob);
                                link.download = filename;
                                document.body.appendChild(link);
                                link.click();
                                document.body.removeChild(link);
                                URL.revokeObjectURL(link.href);
                              },
                              'image/jpeg',
                              0.6
                            );
                          };
                          img.onerror = () => alert('Resim yüklenmesi başarısız');
                          img.src = selectedBelgeData.imageData;
                        } catch (error) {
                          console.error('İndirme hatası:', error);
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
  const syncFingerprintRef = useRef(null);

  useEffect(() => {
    localStorage.setItem('themeColor', themeColor);
  }, [themeColor]);

  useEffect(() => {
    const currentUsername = (localStorage.getItem('username') || '').trim().toLowerCase();
    if (!currentUsername) return;

    const loadUserTheme = async () => {
      try {
        const response = await fetch('/api/users');
        if (!response.ok) return;

        const users = await response.json();
        const currentUser = Array.isArray(users)
          ? users.find((user) => (user?.username || '').toLowerCase() === currentUsername)
          : null;

        if (currentUser?.theme_color) {
          setThemeColor(currentUser.theme_color);
        }
      } catch (error) {
        console.error('User theme load error:', error);
      }
    };

    loadUserTheme();
  }, []);

  useEffect(() => {
    let isCancelled = false;
    let timerId;

    const runSyncCheck = async () => {
      try {
        const response = await fetch('/api/system/sync');
        if (!response.ok) return;

        const payload = await response.json();
        const nextFingerprint = payload?.fingerprint;
        if (!nextFingerprint) return;

        if (!syncFingerprintRef.current) {
          syncFingerprintRef.current = nextFingerprint;
          return;
        }

        if (syncFingerprintRef.current !== nextFingerprint) {
          syncFingerprintRef.current = nextFingerprint;
          triggerDataRefresh();
        }
      } catch (error) {
        console.error('System sync check error:', error);
      } finally {
        if (!isCancelled) {
          timerId = setTimeout(runSyncCheck, 7000);
        }
      }
    };

    runSyncCheck();

    return () => {
      isCancelled = true;
      if (timerId) clearTimeout(timerId);
    };
  }, []);

  return (
    <ThemeContext.Provider value={{ themeColor, setThemeColor }}>
      <Router>
        <Layout themeColor={themeColor} setThemeColor={setThemeColor} />
      </Router>
    </ThemeContext.Provider>
  )
}

export default App
