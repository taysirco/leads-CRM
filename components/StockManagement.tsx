import React, { useState, useEffect } from 'react';
import useSWR from 'swr';

interface StockItem {
  id: number;
  rowIndex: number;
  productName: string;
  initialQuantity: number;
  currentQuantity: number;
  lastUpdate: string;
  synonyms?: string;
  minThreshold?: number;
}

interface StockReports {
  summary: {
    totalProducts: number;
    totalStockValue: number;
    lowStockCount: number;
    outOfStockCount: number;
  };
  byStatus: {
    inStock: number;
    lowStock: number;
    outOfStock: number;
  };
  stockItems: StockItem[];
  alerts: StockItem[];
  lastUpdate: string;
}

const fetcher = (url: string) => fetch(url).then(r => r.json());

export default function StockManagement() {
  const [activeTab, setActiveTab] = useState<'overview' | 'add' | 'returns' | 'reports'>('overview');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  
  // حالات النماذج
  const [showAddModal, setShowAddModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [showDamageModal, setShowDamageModal] = useState(false);
  const [editingItem, setEditingItem] = useState<StockItem | null>(null);

  // جلب بيانات المخزون مع إعدادات محسنة
  const { data: stockData, error: stockError, mutate: refreshStock } = useSWR('/api/stock?action=items', fetcher, {
    refreshInterval: 5000,
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    revalidateOnMount: true,
    dedupingInterval: 1000
  });

  // جلب التقارير
  const { data: reportsData, mutate: refreshReports } = useSWR('/api/stock?action=reports', fetcher, {
    refreshInterval: 15000,
    revalidateOnFocus: true,
    revalidateOnReconnect: true
  });

  // جلب التنبيهات
  const { data: alertsData, mutate: refreshAlerts } = useSWR('/api/stock?action=alerts', fetcher, {
    refreshInterval: 8000,
    revalidateOnFocus: true,
    revalidateOnReconnect: true
  });

  const stockItems: StockItem[] = stockData?.stockItems || [];
  const reports: StockReports = reportsData?.reports;
  const alerts: StockItem[] = alertsData?.alerts || [];

  // دالة تحديث قسرية
  const forceRefreshAll = async () => {
    console.log('🔄 بدء التحديث القسري لجميع البيانات...');
    try {
      await Promise.all([
        fetch('/api/stock?action=items&force=true').then(() => refreshStock()),
        fetch('/api/stock?action=reports&force=true').then(() => refreshReports()),
        fetch('/api/stock?action=alerts&force=true').then(() => refreshAlerts())
      ]);
      console.log('✅ تم التحديث القسري بنجاح');
      return true;
    } catch (error) {
      console.error('❌ خطأ في التحديث القسري:', error);
      return false;
    }
  };

  // تشغيل تحديث قسري عند تحميل المكون
  useEffect(() => {
    console.log('🚀 تحميل مكون إدارة المخزون - تحديث قسري');
    forceRefreshAll();
  }, []);

  // إظهار الرسائل
  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  // إضافة منتج جديد
  const handleAddProduct = async (formData: any) => {
    setIsLoading(true);
    try {
      console.log('📦 بدء إضافة منتج جديد:', formData);
      
      const response = await fetch('/api/stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_item',
          ...formData
        })
      });

      const result = await response.json();
      
      if (response.ok) {
        showMessage('success', result.message);
        setShowAddModal(false);
        
        // تحديث قسري فوري
        setTimeout(async () => {
          await forceRefreshAll();
        }, 500);
        
        // تحديث إضافي بعد ثانيتين
        setTimeout(async () => {
          await forceRefreshAll();
        }, 2000);
        
      } else {
        console.error('❌ خطأ في إضافة المنتج:', result.error);
        showMessage('error', result.error);
      }
    } catch (error) {
      console.error('❌ استثناء في إضافة المنتج:', error);
      showMessage('error', 'حدث خطأ أثناء إضافة المنتج');
    } finally {
      setIsLoading(false);
    }
  };

  // تسجيل مرتجع
  const handleAddReturn = async (returnData: any) => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_return',
          returnData
        })
      });

      const result = await response.json();
      
      if (response.ok) {
        showMessage('success', result.message);
        setShowReturnModal(false);
        await forceRefreshAll();
      } else {
        showMessage('error', result.error);
      }
    } catch (error) {
      showMessage('error', 'حدث خطأ أثناء تسجيل المرتجع');
    } finally {
      setIsLoading(false);
    }
  };

  // تسجيل تالف
  const handleAddDamage = async (damageData: any) => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_damage',
          damageData
        })
      });

      const result = await response.json();
      
      if (response.ok) {
        showMessage('success', result.message);
        setShowDamageModal(false);
        await forceRefreshAll();
      } else {
        showMessage('error', result.error);
      }
    } catch (error) {
      showMessage('error', 'حدث خطأ أثناء تسجيل التالف');
    } finally {
      setIsLoading(false);
    }
  };

  // تحديث منتج
  const handleUpdateItem = async (item: StockItem) => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/stock', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_item',
          ...item
        })
      });

      const result = await response.json();
      
      if (response.ok) {
        showMessage('success', result.message);
        setEditingItem(null);
        await forceRefreshAll();
      } else {
        showMessage('error', result.error);
      }
    } catch (error) {
      showMessage('error', 'حدث خطأ أثناء تحديث المنتج');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* رسائل التنبيه */}
      {message && (
        <div className={`p-4 rounded-lg border ${
          message.type === 'success' 
            ? 'bg-green-50 border-green-200 text-green-800' 
            : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {message.type === 'success' ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              )}
            </svg>
            {message.text}
          </div>
        </div>
      )}

      {/* تنبيهات نفاد المخزون */}
      {alerts.length > 0 && (
        <div className="bg-gradient-to-r from-red-50 to-orange-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.268 18.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <h3 className="font-bold text-red-800">تحذير: نفاد المخزون</h3>
          </div>
          <div className="space-y-2">
            {alerts.map(alert => (
              <div key={alert.id} className="flex justify-between items-center text-sm">
                <span className="font-medium text-red-700">{alert.productName}</span>
                <span className="text-red-600">
                  {alert.currentQuantity === 0 ? 'نفد المخزون' : `متبقي: ${alert.currentQuantity}`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* عنوان الصفحة مع الأزرار */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-6 rounded-lg">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold mb-2">📦 إدارة المخزون</h1>
            <p className="text-blue-100">إدارة شاملة للمخزون مع تتبع المبيعات والمرتجعات والتوالف</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={async () => {
                try {
                  setIsLoading(true);
                  showMessage('success', 'جاري تشخيص Google Sheets...');
                  
                  console.log('🩺 بدء التشخيص الشامل...');
                  
                  const response = await fetch('/api/stock?action=diagnose');
                  const result = await response.json();
                  
                  console.log('🩺 نتيجة التشخيص:', result);
                  
                  if (result.diagnoseResult.success) {
                    showMessage('success', `✅ ${result.diagnoseResult.message}`);
                    await forceRefreshAll();
                  } else {
                    showMessage('error', `❌ ${result.diagnoseResult.message}`);
                  }
                } catch (error) {
                  showMessage('error', 'فشل التشخيص');
                  console.error('❌ خطأ في التشخيص:', error);
                } finally {
                  setIsLoading(false);
                }
              }}
              disabled={isLoading}
              className="px-3 py-2 bg-white bg-opacity-20 text-white rounded-lg hover:bg-opacity-30 transition-all font-medium flex items-center gap-2 disabled:opacity-50 text-sm"
            >
              🩺 تشخيص شامل
            </button>

            <button
              onClick={async () => {
                try {
                  setIsLoading(true);
                  showMessage('success', 'جاري اختبار التزامن...');
                  
                  const response = await fetch('/api/stock?action=test');
                  const result = await response.json();
                  
                  if (result.testResult.success) {
                    showMessage('success', `✅ ${result.testResult.message}`);
                    await forceRefreshAll();
                  } else {
                    showMessage('error', `❌ ${result.testResult.message}`);
                  }
                } catch (error) {
                  showMessage('error', 'فشل اختبار التزامن');
                } finally {
                  setIsLoading(false);
                }
              }}
              disabled={isLoading}
              className="px-3 py-2 bg-white bg-opacity-20 text-white rounded-lg hover:bg-opacity-30 transition-all font-medium flex items-center gap-2 disabled:opacity-50 text-sm"
            >
              🧪 اختبار
            </button>
            
            <button
              onClick={async () => {
                try {
                  setIsLoading(true);
                  await forceRefreshAll();
                  showMessage('success', 'تم تحديث البيانات بنجاح');
                } catch (error) {
                  showMessage('error', 'فشل في تحديث البيانات');
                } finally {
                  setIsLoading(false);
                }
              }}
              disabled={isLoading}
              className="px-3 py-2 bg-white bg-opacity-20 text-white rounded-lg hover:bg-opacity-30 transition-all font-medium flex items-center gap-2 disabled:opacity-50 text-sm"
            >
              🔄 تحديث
            </button>
          </div>
        </div>
      </div>

      {/* إحصائيات سريعة */}
      {reports && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">إجمالي المنتجات</p>
                <p className="text-2xl font-bold text-gray-900">{reports.summary.totalProducts}</p>
              </div>
              <div className="p-3 bg-blue-100 rounded-full">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
            </div>
          </div>
          
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">إجمالي المخزون</p>
                <p className="text-2xl font-bold text-gray-900">{reports.summary.totalStockValue}</p>
              </div>
              <div className="p-3 bg-green-100 rounded-full">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
            </div>
          </div>
          
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">مخزون منخفض</p>
                <p className="text-2xl font-bold text-yellow-600">{reports.summary.lowStockCount}</p>
              </div>
              <div className="p-3 bg-yellow-100 rounded-full">
                <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.268 18.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
            </div>
          </div>
          
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">نفد المخزون</p>
                <p className="text-2xl font-bold text-red-600">{reports.summary.outOfStockCount}</p>
              </div>
              <div className="p-3 bg-red-100 rounded-full">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* التبويبات */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-6">
            {[
              { id: 'overview', label: '📋 نظرة عامة', icon: '📋' },
              { id: 'add', label: '➕ إضافة منتج', icon: '➕' },
              { id: 'returns', label: '↩️ المرتجعات والتوالف', icon: '↩️' },
              { id: 'reports', label: '📊 التقارير', icon: '📊' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-6">
          {activeTab === 'overview' && (
            <StockOverview 
              stockItems={stockItems}
              onEdit={setEditingItem}
              onAdd={() => setShowAddModal(true)}
              isLoading={stockError}
            />
          )}
          
          {activeTab === 'add' && (
            <AddProductForm 
              onSubmit={handleAddProduct}
              isLoading={isLoading}
            />
          )}
          
          {activeTab === 'returns' && (
            <ReturnsAndDamage 
              stockItems={stockItems}
              onAddReturn={() => setShowReturnModal(true)}
              onAddDamage={() => setShowDamageModal(true)}
            />
          )}
          
          {activeTab === 'reports' && (
            <StockReports 
              reports={reports}
              stockItems={stockItems}
            />
          )}
        </div>
      </div>

      {/* النوافذ المنبثقة */}
      {showAddModal && (
        <AddProductModal 
          onClose={() => setShowAddModal(false)}
          onSubmit={handleAddProduct}
          isLoading={isLoading}
        />
      )}

      {showReturnModal && (
        <ReturnModal 
          stockItems={stockItems}
          onClose={() => setShowReturnModal(false)}
          onSubmit={handleAddReturn}
          isLoading={isLoading}
        />
      )}

      {showDamageModal && (
        <DamageModal 
          stockItems={stockItems}
          onClose={() => setShowDamageModal(false)}
          onSubmit={handleAddDamage}
          isLoading={isLoading}
        />
      )}

      {editingItem && (
        <EditItemModal 
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onSubmit={handleUpdateItem}
          isLoading={isLoading}
        />
      )}
    </div>
  );
}

// المكونات الفرعية
function StockOverview({ stockItems, onEdit, onAdd, isLoading }: any) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-gray-900">قائمة المنتجات</h2>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">إجمالي: {stockItems.length} منتج</span>
          <button
            onClick={onAdd}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm font-medium"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            إضافة منتج جديد
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-3 text-right font-medium text-gray-700">المنتج</th>
              <th className="px-3 py-3 text-right font-medium text-gray-700">الكمية الأولية</th>
              <th className="px-3 py-3 text-right font-medium text-gray-700">المخزون الحالي</th>
              <th className="px-3 py-3 text-right font-medium text-gray-700">الحد الأدنى</th>
              <th className="px-3 py-3 text-right font-medium text-gray-700">آخر تحديث</th>
              <th className="px-3 py-3 text-right font-medium text-gray-700">الحالة</th>
              <th className="px-3 py-3 text-right font-medium text-gray-700">إجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {stockItems.map((item: StockItem) => (
              <tr key={item.id} className="hover:bg-gray-50">
                <td className="px-3 py-4">
                  <div>
                    <div className="font-medium text-gray-900">{item.productName}</div>
                    {item.synonyms && (
                      <div className="text-xs text-gray-500">متردفات: {item.synonyms}</div>
                    )}
                  </div>
                </td>
                <td className="px-3 py-4 text-gray-900">{item.initialQuantity}</td>
                <td className="px-3 py-4">
                  <span className={`font-bold ${
                    item.currentQuantity <= 0 ? 'text-red-600' :
                    item.currentQuantity <= (item.minThreshold || 10) ? 'text-yellow-600' :
                    'text-green-600'
                  }`}>
                    {item.currentQuantity}
                  </span>
                </td>
                <td className="px-3 py-4 text-gray-900">{item.minThreshold || 10}</td>
                <td className="px-3 py-4 text-gray-500">{item.lastUpdate}</td>
                <td className="px-3 py-4">
                  {item.currentQuantity <= 0 ? (
                    <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded-full">
                      نفد المخزون
                    </span>
                  ) : item.currentQuantity <= (item.minThreshold || 10) ? (
                    <span className="px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded-full">
                      مخزون منخفض
                    </span>
                  ) : (
                    <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full">
                      متوفر
                    </span>
                  )}
                </td>
                <td className="px-3 py-4">
                  <button
                    onClick={() => onEdit(item)}
                    className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                  >
                    تعديل
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {stockItems.length === 0 && (
        <div className="text-center py-12">
          <div className="p-4 bg-gray-100 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">لا توجد منتجات في المخزون</h3>
          <p className="text-gray-500 mb-4">ابدأ بإضافة منتجات جديدة لإدارة المخزون</p>
          <button
            onClick={onAdd}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            إضافة أول منتج
          </button>
        </div>
      )}
    </div>
  );
}

function AddProductForm({ onSubmit, isLoading }: any) {
  const [formData, setFormData] = useState({
    productName: '',
    initialQuantity: '',
    synonyms: '',
    minThreshold: '10'
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
    setFormData({ productName: '', initialQuantity: '', synonyms: '', minThreshold: '10' });
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-xl font-bold text-gray-900 mb-6">إضافة منتج جديد</h2>
      
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">اسم المنتج</label>
          <input
            type="text"
            value={formData.productName}
            onChange={(e) => setFormData({...formData, productName: e.target.value})}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            required
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">الكمية الأولية</label>
            <input
              type="number"
              value={formData.initialQuantity}
              onChange={(e) => setFormData({...formData, initialQuantity: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              min="0"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">الحد الأدنى للتنبيه</label>
            <input
              type="number"
              value={formData.minThreshold}
              onChange={(e) => setFormData({...formData, minThreshold: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              min="0"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">المتردفات (مفصولة بفاصلة)</label>
          <input
            type="text"
            value={formData.synonyms}
            onChange={(e) => setFormData({...formData, synonyms: e.target.value})}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="مثال: جوال، هاتف، موبايل"
          />
          <p className="text-xs text-gray-500 mt-1">
            المتردفات تساعد في المطابقة التلقائية مع أسماء المنتجات في الطلبات
          </p>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isLoading}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
          >
            {isLoading && (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
            )}
            إضافة المنتج
          </button>
        </div>
      </form>
    </div>
  );
}

function ReturnsAndDamage({ stockItems, onAddReturn, onAddDamage }: any) {
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-gray-900">إدارة المرتجعات والتوالف</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-blue-50 p-6 rounded-lg border border-blue-200">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-blue-100 rounded-full">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-blue-900">المرتجعات</h3>
          </div>
          <p className="text-blue-700 mb-4">تسجيل المنتجات المرتجعة من العملاء</p>
          <button
            onClick={onAddReturn}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            تسجيل مرتجع
          </button>
        </div>

        <div className="bg-red-50 p-6 rounded-lg border border-red-200">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-red-100 rounded-full">
              <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-red-900">التوالف والمفقودات</h3>
          </div>
          <p className="text-red-700 mb-4">تسجيل المنتجات التالفة أو المفقودة</p>
          <button
            onClick={onAddDamage}
            className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            تسجيل تالف/مفقود
          </button>
        </div>
      </div>
    </div>
  );
}

function StockReports({ reports, stockItems }: any) {
  if (!reports) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-gray-900">تقارير المخزون</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-green-50 p-6 rounded-lg border border-green-200">
          <h3 className="font-bold text-green-900 mb-2">منتجات متوفرة</h3>
          <p className="text-3xl font-bold text-green-700">{reports.byStatus.inStock}</p>
          <p className="text-sm text-green-600">مخزون جيد</p>
        </div>

        <div className="bg-yellow-50 p-6 rounded-lg border border-yellow-200">
          <h3 className="font-bold text-yellow-900 mb-2">مخزون منخفض</h3>
          <p className="text-3xl font-bold text-yellow-700">{reports.byStatus.lowStock}</p>
          <p className="text-sm text-yellow-600">يحتاج إعادة تموين</p>
        </div>

        <div className="bg-red-50 p-6 rounded-lg border border-red-200">
          <h3 className="font-bold text-red-900 mb-2">نفد المخزون</h3>
          <p className="text-3xl font-bold text-red-700">{reports.byStatus.outOfStock}</p>
          <p className="text-sm text-red-600">يحتاج تموين فوري</p>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">تفاصيل المنتجات</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-3 text-right font-medium text-gray-700">المنتج</th>
                <th className="px-3 py-3 text-right font-medium text-gray-700">المخزون الحالي</th>
                <th className="px-3 py-3 text-right font-medium text-gray-700">المباع</th>
                <th className="px-3 py-3 text-right font-medium text-gray-700">المعدل</th>
                <th className="px-3 py-3 text-right font-medium text-gray-700">الحالة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {stockItems.map((item: StockItem) => {
                const sold = item.initialQuantity - item.currentQuantity;
                const turnoverRate = item.initialQuantity > 0 ? ((sold / item.initialQuantity) * 100).toFixed(1) : '0';
                
                return (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-3 py-4 font-medium text-gray-900">{item.productName}</td>
                    <td className="px-3 py-4">{item.currentQuantity}</td>
                    <td className="px-3 py-4">{sold}</td>
                    <td className="px-3 py-4">{turnoverRate}%</td>
                    <td className="px-3 py-4">
                      {item.currentQuantity <= 0 ? (
                        <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded-full">
                          نفد
                        </span>
                      ) : item.currentQuantity <= (item.minThreshold || 10) ? (
                        <span className="px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded-full">
                          منخفض
                        </span>
                      ) : (
                        <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full">
                          جيد
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-sm text-gray-500 text-center">
        آخر تحديث: {reports.lastUpdate}
      </p>
    </div>
  );
}

// النوافذ المنبثقة المحسنة
function AddProductModal({ onClose, onSubmit, isLoading }: any) { 
  const [formData, setFormData] = useState({
    productName: '',
    initialQuantity: '',
    synonyms: '',
    minThreshold: '10'
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full flex items-center justify-center z-50">
      <div className="relative p-8 bg-white w-full max-w-md mx-auto rounded-lg shadow-lg">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold text-gray-900">إضافة منتج جديد</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl font-bold">×</button>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">اسم المنتج</label>
            <input
              type="text"
              value={formData.productName}
              onChange={(e) => setFormData({...formData, productName: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">الكمية الأولية</label>
              <input
                type="number"
                value={formData.initialQuantity}
                onChange={(e) => setFormData({...formData, initialQuantity: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                min="0"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">الحد الأدنى</label>
              <input
                type="number"
                value={formData.minThreshold}
                onChange={(e) => setFormData({...formData, minThreshold: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                min="0"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">المتردفات</label>
            <input
              type="text"
              value={formData.synonyms}
              onChange={(e) => setFormData({...formData, synonyms: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="مثال: جوال، هاتف، موبايل"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={onClose} className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
              إلغاء
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              {isLoading && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>}
              إضافة المنتج
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ReturnModal({ stockItems, onClose, onSubmit, isLoading }: any) { return null; }
function DamageModal({ stockItems, onClose, onSubmit, isLoading }: any) { return null; }
function EditItemModal({ item, onClose, onSubmit, isLoading }: any) { return null; } 