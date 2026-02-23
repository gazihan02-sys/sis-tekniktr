import { useEffect, useState, createContext, useContext } from 'react'
import { initFlowbite } from 'flowbite'
import { BrowserRouter as Router, Routes, Route, Link, useLocation, useNavigate, useParams, Navigate } from 'react-router-dom'
import Login from './pages/Login'

// Create Theme Context
const ThemeContext = createContext();

const useTheme = () => useContext(ThemeContext);

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
    navigate('/login', { replace: true });
  }, [navigate]);
  
  return null;
}

// Private Route Component - Check if user is authenticated
function PrivateRoute({ children }) {
  const isAuthenticated = !!localStorage.getItem('token');
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
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
  const [allCustomers, setAllCustomers] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);
  
  useEffect(() => {
    // Fetch stats
    fetch('http://localhost:3000/api/musteri-kabul/stats')
      .then(res => res.json())
      .then(data => setStats(data))
      .catch(err => console.error('Stats fetch error:', err));
    
    // Fetch all customers for search
    fetch('http://localhost:3000/api/musteri-kabul')
      .then(res => res.json())
      .then(data => setAllCustomers(data))
      .catch(err => console.error('Customers fetch error:', err));
  }, []);

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
    // Fetch customer to get status
    fetch(`http://localhost:3000/api/musteri-kabul/${customerId}`)
      .then(res => res.json())
      .then(data => {
        const statusMap = {
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
        const statusId = statusMap[data.status] || 1;
        navigate(`/status/${statusId}`);
      })
      .catch(err => console.error('Error:', err));
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
             placeholder="Müşteri ara: Ad, soyad, telefon..."
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
  const [statusList, setStatusList] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
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

      const response = await fetch(`http://localhost:3000/api/musteri-kabul/${editingItem.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm)
      });

      console.log('✅ Update response status:', response.status, response.statusText);

      if (response.ok || response.status === 204) {
        console.log('📝 Update başarılı, sayfa yenileniyor...');
        setShowEditModal(false);
        setEditingItem(null);
        alert('✅ Güncellendi');
        
        // Modal kapandığı için timeout ekle ki alert görsün
        setTimeout(() => {
          window.location.reload();
        }, 500);
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
      const response = await fetch(`http://localhost:3000/api/musteri-kabul/${id}`, {
        method: 'DELETE',
      });

      console.log('DELETE response status:', response.status, response.statusText);

      if (response.ok || response.status === 204) {
        // Listeden kaldır
        setStatusList(statusList.filter(item => item.id !== id));
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
  
  useEffect(() => {
    setIsLoading(true);
    fetch(`http://localhost:3000/api/musteri-kabul/by-status/${status}`)
      .then(res => res.json())
      .then(data => {
        setStatusList(data);
        setIsLoading(false);
      })
      .catch(err => {
        console.error('List fetch error:', err);
        setIsLoading(false);
      });
  }, [status]);
  
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
                    <td className="px-6 py-4">
                      <div className="font-medium">{item.ad_soyad}</div>
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
                          const handleBelgeClick = () => {
                            setSelectedBelgeData({ imageData: item[field] || null, type: letter, adi: item.ad_soyad, customerId: item.id });
                            setShowBelgeModal(true);
                          };
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
                      <button className="text-green-600 hover:text-green-800 hover:bg-green-50 transition border border-green-300 rounded-lg p-2 flex items-center justify-center" title="Yazdır">
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
                <div className="mb-4">
                  <h3 className="font-semibold text-gray-900">{item.ad_soyad}</h3>
                  <p className="text-xs text-gray-500 mt-1">
                    {new Date(item.created_at).toLocaleDateString('tr-TR')} {new Date(item.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                  </p>
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
                      const handleBelgeClick = () => {
                        setSelectedBelgeData({ imageData: item[field] || null, type: letter, adi: item.ad_soyad, customerId: item.id });
                        setShowBelgeModal(true);
                      };
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
                  <button className="flex-1 text-green-600 hover:text-green-800 hover:bg-green-50 transition border border-green-300 rounded-lg p-2 flex items-center justify-center" title="Yazdır">
                    <span className="material-icons">print</span>
                  </button>
                  <button className="flex-1 text-red-600 hover:text-red-800 hover:bg-red-50 transition border border-red-300 rounded-lg p-2 flex items-center justify-center" title="Sil" onClick={() => handleDelete(item.id, item.ad_soyad)}>
                    <span className="material-icons">delete</span>
                  </button>
                </div>
              </div>
            ))}
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

      const response = await fetch('http://localhost:3000/api/musteri-kabul', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const result = await response.json();
        const successMsg = `✅ ${result.ad_soyad} - Müşteri başarıyla kaydedildi.\n\n📱 Fatura yükleme linki SMS ile gönderildi.`;
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

function MusteriMontaj() {
  return (
    <div className="p-4 border-2 border-gray-200 border-dashed rounded-lg dark:border-gray-700">
       <h2 className="text-2xl font-bold mb-4 dark:text-white">Müşteri Montaj</h2>
       <p className="text-gray-700 dark:text-gray-300">Müşteri montaj bilgileri burada yönetilir.</p>
    </div>
  );
}

function MontajEkle() {
  const { themeColor } = useTheme();
  
  return (
    <div className="p-4 border-2 border-gray-200 border-dashed rounded-lg dark:border-gray-700">
       <h2 className="text-2xl font-bold mb-4 dark:text-white">Montaj Kaydı Ekle</h2>
       <p className="text-gray-700 dark:text-gray-300 mb-4">Yeni montaj kaydı oluşturun.</p>
       <div className="max-w-2xl">
         <form className="space-y-4">
           <div>
             <label className="block text-sm font-medium text-gray-700 mb-1">Müşteri Adı</label>
             <input type="text" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring" style={{focusRing: themeColor}} placeholder="Müşteri adını girin" />
           </div>
           <div>
             <label className="block text-sm font-medium text-gray-700 mb-1">Ürün Adı</label>
             <input type="text" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring" style={{focusRing: themeColor}} placeholder="Ürün adını girin" />
           </div>
           <div>
             <label className="block text-sm font-medium text-gray-700 mb-1">Montaj Tarihi</label>
             <input type="date" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring" style={{focusRing: themeColor}} />
           </div>
           <div>
             <label className="block text-sm font-medium text-gray-700 mb-1">Notlar</label>
             <textarea className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring" style={{focusRing: themeColor}} rows="4" placeholder="Notların yazabilirsiniz"></textarea>
           </div>
           <button type="submit" style={{ backgroundColor: themeColor }} className="text-white px-4 py-2 rounded-lg hover:opacity-90">Kaydet</button>
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

    setLoading(true);
    setMessage(null);

    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64 = event.target.result;

        const response = await fetch(`http://localhost:3000/api/musteri-kabul/${customerId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ belge_f: base64 })
        });

        if (response.ok || response.status === 204) {
          setMessage({ type: 'success', text: '✅ Fatura başarıyla yüklendi!' });
          setSelectedFile(null);
          setFileName('');
          setTimeout(() => {
            window.location.reload();
          }, 1500);
        } else {
          setMessage({ type: 'error', text: '❌ Yükleme başarısız oldu' });
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

          {/* Upload Button */}
          <button
            onClick={handleUpload}
            disabled={loading || !selectedFile}
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

  useEffect(() => {
    const fetchCustomer = async () => {
      try {
        const response = await fetch(`http://localhost:3000/api/musteri-kabul`);
        const data = await response.json();
        const found = data.find(c => c.id === customerId);
        if (found) {
          setCustomer(found);
          setEditForm({
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
          });
        }
      } catch (error) {
        console.error('Error fetching customer:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchCustomer();
  }, [customerId]);

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editForm.ad_soyad.trim()) {
      alert('Adı soyadı boş olamaz');
      return;
    }

    try {
      const response = await fetch(`http://localhost:3000/api/musteri-kabul/${customerId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm)
      });

      if (response.ok || response.status === 204) {
        alert('✅ Güncellendi');
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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Müşteri Bilgilerini Düzenle</h1>
            {customer.not && (
              <p className="text-red-600 text-sm mt-2">Not: {customer.not}</p>
            )}
          </div>
          <div className="flex gap-1.5">
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
                            const response = await fetch(`http://localhost:3000/api/musteri-kabul/${customerId}`, {
                              method: 'PUT',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ [fieldName]: base64Data })
                            });
                            
                            if (response.ok || response.status === 204) {
                              console.log(`✅ ${label} kaydedildi`);
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

function Ayarlar({ themeColor, setThemeColor }) {
  const [showColorModal, setShowColorModal] = useState(false);
  const [showUserModal, setShowUserModal] = useState(false);
  const [adSoyad, setAdSoyad] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [userSaving, setUserSaving] = useState(false);
  const [userMessage, setUserMessage] = useState(null);
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [editAdSoyad, setEditAdSoyad] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editPassword, setEditPassword] = useState('');

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

  const handleColorSelect = (hex) => {
    setThemeColor(hex);
    localStorage.setItem('themeColor', hex);
    setShowColorModal(false);
  };

  const fetchUsers = async () => {
    setUsersLoading(true);
    try {
      const response = await fetch('http://localhost:3000/api/users');
      if (response.ok) {
        const data = await response.json();
        setUsers(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error('Users fetch error:', error);
    }
    setUsersLoading(false);
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setUserMessage(null);

    if (!adSoyad.trim() || !username.trim() || !password.trim()) {
      setUserMessage({ type: 'error', text: 'Lütfen tüm alanları doldurun.' });
      return;
    }

    setUserSaving(true);

    try {
      const response = await fetch('http://localhost:3000/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ad_soyad: adSoyad,
          username: username,
          password: password,
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
    setUserMessage(null);
  };

  const handleUpdateUser = async (e) => {
    e.preventDefault();
    if (!editingUser?.id) return;

    setUserSaving(true);
    setUserMessage(null);

    try {
      const response = await fetch(`http://localhost:3000/api/users/${editingUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ad_soyad: editAdSoyad,
          username: editUsername,
          password: editPassword,
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
      const response = await fetch(`http://localhost:3000/api/users/${user.id}`, {
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

      {/* Color Modal */}
      {showColorModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-2xl w-full max-h-96 overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900">Renk Seçin</h2>
              <button
                onClick={() => setShowColorModal(false)}
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

            <form onSubmit={handleCreateUser} className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                        <th className="text-left px-4 py-3 font-semibold">Oluşturulma</th>
                        <th className="text-left px-4 py-3 font-semibold">İşlem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((user, index) => (
                        <tr key={user.id || user.username || index} className="border-t border-gray-100">
                          <td className="px-4 py-3 text-gray-900">{user.ad_soyad}</td>
                          <td className="px-4 py-3 text-gray-700">{user.username}</td>
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
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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

    </div>
  );
}

function Layout({ themeColor, setThemeColor }) {
  const [showBelgeModal, setShowBelgeModal] = useState(false);
  const [selectedBelgeData, setSelectedBelgeData] = useState(null);
  const location = useLocation();
  
  // Hide sidebar and navbar on login page
  const isLoginPage = location.pathname === '/login';

  useEffect(() => {
    initFlowbite();
  }, [])

  return (
    <div className="antialiased bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Desktop Sidebar - Hide on login */}
      {!isLoginPage && (
      <aside id="logo-sidebar" className="hidden sm:flex fixed top-0 left-0 z-40 w-24 h-screen transition-transform flex-col" aria-label="Sidebar">
         <div className="h-full px-2 py-3 flex flex-col" style={{backgroundColor: `${themeColor}12`}}>
            <ul className="space-y-2 font-medium flex-1 overflow-y-auto">
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
            </ul>
            <ul className="space-y-2 font-medium">
               <MenuItem 
                 to="/ayarlar" 
                 label="Ayarlar" 
                 themeColor={themeColor}
                 iconName="settings"
               />
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
      {!isLoginPage && (
      <nav className="fixed bottom-0 left-0 right-0 sm:hidden bg-white border-t border-gray-200 px-2 py-2 z-40" style={{backgroundColor: themeColor}}>
         <ul className="flex justify-around items-center">
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
              <Link to="/irsaliye/olustur" className="flex flex-col items-center p-2 rounded-lg text-white hover:opacity-80">
                <span className="material-icons text-xl">edit</span>
                <span className="text-xs mt-0.5">İrsaliye</span>
              </Link>
            </li>
         </ul>
      </nav>
      )}

      <div className={`${isLoginPage ? '' : 'p-4 sm:ml-24 sm:pb-4 pb-24'}`}>
         <Routes>
           <Route path="/login" element={<Login />} />
           <Route path="/logout" element={<Logout />} />
           <Route path="/" element={<PrivateRoute><Home /></PrivateRoute>} />
           <Route path="/status/:status" element={<PrivateRoute><StatusList showBelgeModal={showBelgeModal} setShowBelgeModal={setShowBelgeModal} selectedBelgeData={selectedBelgeData} setSelectedBelgeData={setSelectedBelgeData} /></PrivateRoute>} />
           <Route path="/edit/:customerId" element={<PrivateRoute><Edit /></PrivateRoute>} />
           <Route path="/musteri/kabul" element={<PrivateRoute><MusteriKabul showBelgeModal={showBelgeModal} setShowBelgeModal={setShowBelgeModal} selectedBelgeData={selectedBelgeData} setSelectedBelgeData={setSelectedBelgeData} /></PrivateRoute>} />
           <Route path="/musteri/montaj" element={<PrivateRoute><MusteriMontaj /></PrivateRoute>} />
           <Route path="/montaj/ekle" element={<PrivateRoute><MontajEkle /></PrivateRoute>} />
           <Route path="/montaj/listele" element={<PrivateRoute><MontajListele /></PrivateRoute>} />
           <Route path="/irsaliye/olustur" element={<PrivateRoute><IrsaliyeOlustur /></PrivateRoute>} />
           <Route path="/irsaliye/listesi" element={<PrivateRoute><IrsaliyeListesi /></PrivateRoute>} />
           <Route path="/ayarlar" element={<PrivateRoute><Ayarlar themeColor={themeColor} setThemeColor={setThemeColor} /></PrivateRoute>} />
           <Route path="/fatura/:customerId" element={<PrivateRoute><FaturaYukle /></PrivateRoute>} />
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
                              const response = await fetch(`http://localhost:3000/api/musteri-kabul/${selectedBelgeData.customerId}`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ [field]: base64Data })
                              });
                              
                              if (response.ok || response.status === 204) {
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

  useEffect(() => {
    localStorage.setItem('themeColor', themeColor);
  }, [themeColor]);

  return (
    <ThemeContext.Provider value={{ themeColor, setThemeColor }}>
      <Router>
        <Layout themeColor={themeColor} setThemeColor={setThemeColor} />
      </Router>
    </ThemeContext.Provider>
  )
}

export default App
