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

  // جلب بيانات المخزون مع إعدادات محسنة - تقليل التحديث المفرط
  const { data: stockData, error: stockError, mutate: refreshStock } = useSWR('/api/stock?action=items', fetcher, {
    refreshInterval: 0, // إزالة التحديث التلقائي
    revalidateOnFocus: false, // إزالة التحديث عند التركيز
    revalidateOnReconnect: true, // فقط عند إعادة الاتصال
    revalidateOnMount: true,
    dedupingInterval: 5000, // تجميع الطلبات المتشابهة لمدة 5 ثوان
    errorRetryCount: 2, // تقليل محاولات إعادة المحاولة
    errorRetryInterval: 3000 // زيادة الفترة بين المحاولات
  });

  // جلب التقارير - تقليل التحديث
  const { data: reportsData, mutate: refreshReports } = useSWR('/api/stock?action=reports', fetcher, {
    refreshInterval: 0, // إزالة التحديث التلقائي
    revalidateOnFocus: false,
    revalidateOnReconnect: true,
    errorRetryCount: 1
  });

  // جلب التنبيهات - تقليل التحديث
  const { data: alertsData, mutate: refreshAlerts } = useSWR('/api/stock?action=alerts', fetcher, {
    refreshInterval: 0, // إزالة التحديث التلقائي
    revalidateOnFocus: false,
    revalidateOnReconnect: true,
    errorRetryCount: 1
  });

  const stockItems: StockItem[] = stockData?.stockItems || [];
  const reports: StockReports = reportsData?.reports;
  const alerts: StockItem[] = alertsData?.alerts || [];

  // إضافة defensive programming للتأكد من أن stockItems دائماً array
  const safeStockItems: StockItem[] = Array.isArray(stockItems) ? stockItems : [];
  const safeAlerts: StockItem[] = Array.isArray(alerts) ? alerts : [];

  console.log('📦 Stock data structure:', stockData);
  console.log('📊 Stock items array:', stockItems);
  console.log('✅ Safe stock items:', safeStockItems);

  // دالة تحديث محسنة - مزامنة شاملة مع Google Sheets
  const forceRefreshAll = async () => {
    console.log('🔄 بدء المزامنة الشاملة مع Google Sheets...');
    try {
      // إظهار رسالة تحميل
      setMessage({ type: 'success', text: '🔄 جاري المزامنة مع Google Sheets...' });
      
      // مسح الكاش أولاً لضمان جلب البيانات الطازجة
      console.log('🗑️ مسح الذاكرة المؤقتة...');
      
      // إعادة تحديث البيانات مع إجبار جلب البيانات الطازجة
      const promises = [
        // تحديث بيانات المخزون مع مسح الكاش
        fetch('/api/stock?action=items&force=true').then(res => res.json()),
        // تحديث التقارير مع مسح الكاش  
        fetch('/api/stock?action=reports&force=true').then(res => res.json()),
        // تحديث التنبيهات مع مسح الكاش
        fetch('/api/stock?action=alerts&force=true').then(res => res.json())
      ];
      
      console.log('📡 جاري جلب البيانات الطازجة من Google Sheets...');
      const [stockResult, reportsResult, alertsResult] = await Promise.all(promises);
      
      // التحقق من نجاح العمليات
      if (stockResult.error) {
        throw new Error(`خطأ في جلب بيانات المخزون: ${stockResult.error}`);
      }
      
      if (reportsResult.error) {
        throw new Error(`خطأ في جلب التقارير: ${reportsResult.error}`);
      }
      
      if (alertsResult.error) {
        throw new Error(`خطأ في جلب التنبيهات: ${alertsResult.error}`);
      }
      
      // تحديث SWR بالبيانات الجديدة
      console.log('🔄 تحديث البيانات المحلية...');
      await Promise.all([
        refreshStock(),
        refreshReports(), 
        refreshAlerts()
      ]);
      
      console.log('✅ تمت المزامنة بنجاح مع Google Sheets');
      console.log('📊 البيانات المحدثة:', {
        stockItems: stockResult.stockItems?.length || 0,
        reports: !!reportsResult.reports,
        alerts: alertsResult.alerts?.length || 0
      });
      
      setMessage({ 
        type: 'success', 
        text: `✅ تمت المزامنة بنجاح! تم تحديث ${stockResult.stockItems?.length || 0} منتج مع ${alertsResult.alerts?.length || 0} تنبيه جديد` 
      });
      
      return true;
    } catch (error: any) {
      console.error('❌ خطأ في المزامنة:', error);
      setMessage({ 
        type: 'error', 
        text: `❌ فشل في المزامنة: ${error.message || 'خطأ غير معروف'}` 
      });
      return false;
    }
  };

  // إزالة التحديث التلقائي عند التحميل
  // useEffect(() => {
  //   console.log('🚀 تحميل مكون إدارة المخزون');
  //   // لا نقوم بتحديث قسري عند التحميل
  // }, []);

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
      
      // التحقق من صحة البيانات
      const initialQuantity = parseInt(formData.initialQuantity);
      const minThreshold = parseInt(formData.minThreshold) || 10;
      
      if (initialQuantity < 0) {
        showMessage('error', 'الكمية الأولية لا يمكن أن تكون سالبة');
        return;
      }
      
      if (minThreshold < 0) {
        showMessage('error', 'الحد الأدنى لا يمكن أن يكون سالباً');
        return;
      }
      
      if (minThreshold > initialQuantity) {
        showMessage('error', 'الحد الأدنى لا يمكن أن يكون أكبر من الكمية الأولية');
        return;
      }
      
      const response = await fetch('/api/stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_item',
          productName: formData.productName.trim(),
          initialQuantity: initialQuantity,
          currentQuantity: initialQuantity, // الكمية الحالية = الكمية الأولية عند الإضافة
          synonyms: formData.synonyms.trim(),
          minThreshold: minThreshold
        })
      });

      const result = await response.json();
      
      if (response.ok) {
        showMessage('success', result.message);
        setShowAddModal(false);
        
        // تحديث واحد فقط بعد النجاح
        setTimeout(async () => {
          await forceRefreshAll();
        }, 1000);
        
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

  // تسجيل مرتجع - يزيد من المخزون
  const handleAddReturn = async (returnData: any) => {
    setIsLoading(true);
    try {
      // التحقق من صحة البيانات
      const quantity = parseInt(returnData.quantity);
      
      if (quantity <= 0) {
        showMessage('error', 'كمية المرتجع يجب أن تكون أكبر من صفر');
        return;
      }
      
      if (!returnData.productName || returnData.productName.trim() === '') {
        showMessage('error', 'يجب اختيار المنتج');
        return;
      }
      
      // العثور على المنتج للتحقق من وجوده
      const selectedProduct = safeStockItems.find(item => item.productName === returnData.productName);
      if (!selectedProduct) {
        showMessage('error', 'المنتج المحدد غير موجود في المخزون');
        return;
      }
      
      console.log(`📦 تسجيل مرتجع: ${quantity} من ${returnData.productName}`);
      console.log(`📊 المخزون الحالي قبل المرتجع: ${selectedProduct.currentQuantity}`);
      
      const response = await fetch('/api/stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_return',
          returnData: {
            productName: returnData.productName,
            quantity: quantity,
            reason: returnData.reason || 'other',
            notes: returnData.notes || '',
            date: new Date().toISOString().split('T')[0]
          }
        })
      });

      const result = await response.json();
      
      if (response.ok) {
        const newQuantity = selectedProduct.currentQuantity + quantity;
        showMessage('success', `${result.message}. المخزون الجديد: ${newQuantity}`);
        setShowReturnModal(false);
        await forceRefreshAll();
      } else {
        showMessage('error', result.error);
      }
    } catch (error) {
      console.error('❌ خطأ في تسجيل المرتجع:', error);
      showMessage('error', 'حدث خطأ أثناء تسجيل المرتجع');
    } finally {
      setIsLoading(false);
    }
  };

  // تسجيل تالف - يقلل من المخزون
  const handleAddDamage = async (damageData: any) => {
    setIsLoading(true);
    try {
      // التحقق من صحة البيانات
      const quantity = parseInt(damageData.quantity);
      
      if (quantity <= 0) {
        showMessage('error', 'كمية التالف يجب أن تكون أكبر من صفر');
        return;
      }
      
      if (!damageData.productName || damageData.productName.trim() === '') {
        showMessage('error', 'يجب اختيار المنتج');
        return;
      }
      
      // العثور على المنتج للتحقق من كفاية المخزون
      const selectedProduct = safeStockItems.find(item => item.productName === damageData.productName);
      if (!selectedProduct) {
        showMessage('error', 'المنتج المحدد غير موجود في المخزون');
        return;
      }
      
      if (selectedProduct.currentQuantity < quantity) {
        showMessage('error', `المخزون غير كافي. المتوفر: ${selectedProduct.currentQuantity}, المطلوب: ${quantity}`);
        return;
      }
      
      console.log(`💥 تسجيل تالف: ${quantity} من ${damageData.productName}`);
      console.log(`📊 المخزون الحالي قبل التالف: ${selectedProduct.currentQuantity}`);
      
      const response = await fetch('/api/stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_damage',
          damageData: {
            productName: damageData.productName,
            quantity: quantity,
            type: damageData.type || 'damage',
            reason: damageData.reason || 'تلف أثناء الشحن',
            notes: damageData.notes || '',
            date: new Date().toISOString().split('T')[0]
          }
        })
      });

      const result = await response.json();
      
      if (response.ok) {
        const newQuantity = Math.max(0, selectedProduct.currentQuantity - quantity);
        showMessage('success', `${result.message}. المخزون الجديد: ${newQuantity}`);
        setShowDamageModal(false);
        await forceRefreshAll();
      } else {
        showMessage('error', result.error);
      }
    } catch (error) {
      console.error('❌ خطأ في تسجيل التالف:', error);
      showMessage('error', 'حدث خطأ أثناء تسجيل التالف');
    } finally {
      setIsLoading(false);
    }
  };

  // تحديث منتج
  const handleUpdateItem = async (item: StockItem) => {
    setIsLoading(true);
    try {
      // التحقق من صحة البيانات
      const initialQuantity = item.initialQuantity;
      const currentQuantity = item.currentQuantity;
      const minThreshold = item.minThreshold || 10;
      
      if (initialQuantity < 0 || currentQuantity < 0) {
        showMessage('error', 'الكميات لا يمكن أن تكون سالبة');
        return;
      }
      
      if (minThreshold < 0) {
        showMessage('error', 'الحد الأدنى لا يمكن أن يكون سالباً');
        return;
      }
      
      // السماح بأن تكون الكمية الحالية أكبر من الأولية (في حالة المرتجعات)
      // لكن تحذير إذا كانت الكمية الحالية أقل من المباعة بشكل منطقي
      if (currentQuantity > initialQuantity) {
        // هذا طبيعي في حالة وجود مرتجعات
        console.log(`📊 الكمية الحالية (${currentQuantity}) أكبر من الأولية (${initialQuantity}) - مرتجعات`);
      }
      
      console.log(`✏️ تحديث منتج: ${item.productName}`);
      console.log(`📊 الكمية الأولية: ${initialQuantity}, الحالية: ${currentQuantity}`);
      
      const response = await fetch('/api/stock', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_item',
          id: item.id,
          productName: item.productName.trim(),
          initialQuantity: initialQuantity,
          currentQuantity: currentQuantity,
          synonyms: item.synonyms?.trim() || '',
          minThreshold: minThreshold
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
      console.error('❌ خطأ في تحديث المنتج:', error);
      showMessage('error', 'حدث خطأ أثناء تحديث المنتج');
    } finally {
      setIsLoading(false);
    }
  };

  // معالجة حالات الخطأ
  if (stockError) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-lg">
        <div className="flex items-center gap-2 text-red-800">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.268 18.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <h3 className="font-bold">خطأ في تحميل بيانات المخزون</h3>
        </div>
        <p className="text-red-700 mt-2">
          فشل في جلب البيانات. يرجى التحقق من الاتصال مع Google Sheets.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
        >
          إعادة تحميل الصفحة
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-4 sm:py-8 px-2 sm:px-4 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-4 sm:space-y-8">
        {/* رسائل النجاح والخطأ */}
        {message && (
          <div className={`p-3 sm:p-4 rounded-lg border ${
            message.type === 'error' 
              ? 'bg-red-50 border-red-200 text-red-800' 
              : 'bg-green-50 border-green-200 text-green-800'
          }`}>
            <div className="flex items-center justify-between">
              <span className="text-sm sm:text-base">{message.text}</span>
              <button 
                onClick={() => setMessage(null)}
                className="text-gray-400 hover:text-gray-600 ml-2 text-lg sm:text-xl"
              >
                ×
              </button>
            </div>
          </div>
        )}

        {/* عرض التنبيهات */}
        {alerts && alerts.length > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 sm:p-4">
            <div className="flex items-center mb-2">
              <svg className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.268 18.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <h3 className="font-medium text-yellow-800 text-sm sm:text-base">تنبيهات المخزون</h3>
            </div>
            <div className="space-y-1">
              {alerts.map((alert: any, index: number) => (
                <p key={index} className="text-yellow-700 text-xs sm:text-sm">• {alert.message}</p>
              ))}
            </div>
          </div>
        )}

        {/* عنوان الصفحة مع الأزرار */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-4 sm:p-6 rounded-lg">
          <div className="flex flex-col space-y-4 sm:space-y-0 sm:flex-row sm:justify-between sm:items-center">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold mb-2">📦 إدارة المخزون</h1>
              <p className="text-blue-100 text-sm sm:text-base">إدارة شاملة للمخزون مع تتبع المبيعات والمرتجعات والتوالف</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                onClick={async () => {
                  try {
                    setIsLoading(true);
                    showMessage('success', 'جاري تشخيص Google Sheets...');
                    
                    console.log('🩺 بدء التشخيص الشامل...');
                    
                    const response = await fetch('/api/stock?action=diagnose');
                    const result = await response.json();
                    
                    console.log('🩺 نتيجة التشخيص:', result);
                    
                    if (result.diagnoseResult?.success) {
                      showMessage('success', `✅ ${result.diagnoseResult.message}`);
                      await forceRefreshAll();
                    } else {
                      showMessage('error', `❌ ${result.diagnoseResult?.message || 'فشل التشخيص'}`);
                    }
                  } catch (error) {
                    showMessage('error', 'فشل التشخيص');
                    console.error('❌ خطأ في التشخيص:', error);
                  } finally {
                    setIsLoading(false);
                  }
                }}
                disabled={isLoading}
                className="px-2 sm:px-3 py-2 bg-white bg-opacity-20 text-white rounded-lg hover:bg-opacity-30 transition-all font-medium flex items-center justify-center gap-1 sm:gap-2 disabled:opacity-50 text-xs sm:text-sm"
              >
                🩺 <span className="hidden sm:inline">تشخيص شامل</span><span className="sm:hidden">تشخيص</span>
              </button>

              <button
                onClick={async () => {
                  try {
                    setIsLoading(true);
                    showMessage('success', 'جاري اختبار التزامن...');
                    
                    const response = await fetch('/api/stock?action=test');
                    const result = await response.json();
                    
                    if (result.testResult?.success) {
                      showMessage('success', `✅ ${result.testResult.message}`);
                      await forceRefreshAll();
                    } else {
                      showMessage('error', `❌ ${result.testResult?.message || 'فشل الاختبار'}`);
                    }
                  } catch (error) {
                    showMessage('error', 'فشل اختبار التزامن');
                  } finally {
                    setIsLoading(false);
                  }
                }}
                disabled={isLoading}
                className="px-2 sm:px-3 py-2 bg-white bg-opacity-20 text-white rounded-lg hover:bg-opacity-30 transition-all font-medium flex items-center justify-center gap-1 sm:gap-2 disabled:opacity-50 text-xs sm:text-sm"
              >
                🧪 <span className="hidden sm:inline">اختبار</span><span className="sm:hidden">اختبار</span>
              </button>
              
              <button
                onClick={async () => {
                  try {
                    setIsLoading(true);
                    console.log('👤 المستخدم طلب مزامنة شاملة مع Google Sheets');
                    
                    // تنفيذ المزامنة الشاملة
                    const success = await forceRefreshAll();
                    
                    if (success) {
                      console.log('🎉 المزامنة اكتملت بنجاح');
                    } else {
                      console.log('⚠️ المزامنة واجهت مشاكل');
                    }
                  } catch (error) {
                    console.error('❌ خطأ في تنفيذ المزامنة:', error);
                    setMessage({ 
                      type: 'error', 
                      text: 'فشل في المزامنة - تحقق من الاتصال بالإنترنت' 
                    });
                  } finally {
                    setIsLoading(false);
                  }
                }}
                disabled={isLoading}
                className="px-2 sm:px-3 py-2 bg-white bg-opacity-20 text-white rounded-lg hover:bg-opacity-30 transition-all font-medium flex items-center justify-center gap-1 sm:gap-2 disabled:opacity-50 text-xs sm:text-sm"
                title="مزامنة شاملة مع Google Sheets - يمسح الكاش ويجلب أحدث البيانات"
              >
                {isLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-3 w-3 sm:h-4 sm:w-4 border-b-2 border-white"></div>
                    <span className="hidden sm:inline">مزامنة...</span><span className="sm:hidden">مزامنة</span>
                  </>
                ) : (
                  <>
                    🔄 <span className="hidden sm:inline">مزامنة شاملة</span><span className="sm:hidden">مزامنة</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* إحصائيات سريعة */}
        {reports && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="bg-white p-4 sm:p-6 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs sm:text-sm font-medium text-gray-600">إجمالي المنتجات</p>
                  <p className="text-lg sm:text-2xl font-bold text-gray-900">{reports.summary.totalProducts}</p>
                </div>
                <div className="p-2 sm:p-3 bg-blue-100 rounded-full">
                  <svg className="w-4 h-4 sm:w-6 sm:h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                </div>
              </div>
            </div>
            
            <div className="bg-white p-4 sm:p-6 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs sm:text-sm font-medium text-gray-600">إجمالي المخزون</p>
                  <p className="text-lg sm:text-2xl font-bold text-gray-900">{reports.summary.totalStockValue}</p>
                </div>
                <div className="p-2 sm:p-3 bg-green-100 rounded-full">
                  <svg className="w-4 h-4 sm:w-6 sm:h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
              </div>
            </div>
            
            <div className="bg-white p-4 sm:p-6 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs sm:text-sm font-medium text-gray-600">مخزون منخفض</p>
                  <p className="text-lg sm:text-2xl font-bold text-yellow-600">{reports.summary.lowStockCount}</p>
                </div>
                <div className="p-2 sm:p-3 bg-yellow-100 rounded-full">
                  <svg className="w-4 h-4 sm:w-6 sm:h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.268 18.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                </div>
              </div>
            </div>
            
            <div className="bg-white p-4 sm:p-6 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs sm:text-sm font-medium text-gray-600">نفد المخزون</p>
                  <p className="text-lg sm:text-2xl font-bold text-red-600">{reports.summary.outOfStockCount}</p>
                </div>
                <div className="p-2 sm:p-3 bg-red-100 rounded-full">
                  <svg className="w-4 h-4 sm:w-6 sm:h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
            <nav className="flex overflow-x-auto px-2 sm:px-6">
              {[
                { id: 'overview', label: '📋 نظرة عامة', icon: '📋', shortLabel: 'عامة' },
                { id: 'add', label: '➕ إضافة منتج', icon: '➕', shortLabel: 'إضافة' },
                { id: 'returns', label: '↩️ المرتجعات والتوالف', icon: '↩️', shortLabel: 'مرتجعات' },
                { id: 'reports', label: '📊 التقارير', icon: '📊', shortLabel: 'تقارير' }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`py-3 sm:py-4 px-2 sm:px-4 border-b-2 font-medium text-xs sm:text-sm whitespace-nowrap ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <span className="sm:hidden">{tab.icon} {tab.shortLabel}</span>
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              ))}
            </nav>
          </div>

          <div className="p-6">
            {activeTab === 'overview' && (
              <StockOverview 
                stockItems={safeStockItems}
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
                stockItems={safeStockItems}
                onAddReturn={() => setShowReturnModal(true)}
                onAddDamage={() => setShowDamageModal(true)}
              />
            )}
            
            {activeTab === 'reports' && (
              <StockReports 
                reports={reports}
                stockItems={safeStockItems}
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
            stockItems={safeStockItems}
            onClose={() => setShowReturnModal(false)}
            onSubmit={handleAddReturn}
            isLoading={isLoading}
          />
        )}

        {showDamageModal && (
          <DamageModal 
            stockItems={safeStockItems}
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
    </div>
  );
}

// المكونات الفرعية
function StockOverview({ stockItems, onEdit, onAdd, isLoading }: any) {
  // التأكد من أن stockItems هو array
  const safeItems = Array.isArray(stockItems) ? stockItems : [];
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32 sm:h-64">
        <div className="animate-spin rounded-full h-8 w-8 sm:h-12 sm:w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center space-y-3 sm:space-y-0">
        <h2 className="text-lg sm:text-xl font-bold text-gray-900">قائمة المنتجات</h2>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
          <span className="text-xs sm:text-sm text-gray-500">إجمالي: {safeItems.length} منتج</span>
          <button
            onClick={onAdd}
            className="px-3 sm:px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 text-sm font-medium"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            <span className="hidden sm:inline">إضافة منتج جديد</span>
            <span className="sm:hidden">إضافة منتج</span>
          </button>
        </div>
      </div>

      <div className="overflow-x-auto -mx-2 sm:mx-0">
        <div className="inline-block min-w-full align-middle">
          <div className="overflow-hidden shadow-sm ring-1 ring-black ring-opacity-5 rounded-lg">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-2 sm:px-3 py-2 sm:py-3 text-right font-medium text-gray-700 text-xs sm:text-sm min-w-[120px]">المنتج</th>
                  <th className="px-2 sm:px-3 py-2 sm:py-3 text-right font-medium text-gray-700 text-xs sm:text-sm">الكمية الأولية</th>
                  <th className="px-2 sm:px-3 py-2 sm:py-3 text-right font-medium text-gray-700 text-xs sm:text-sm">المخزون الحالي</th>
                  <th className="px-2 sm:px-3 py-2 sm:py-3 text-right font-medium text-gray-700 text-xs sm:text-sm">الحد الأدنى</th>
                  <th className="px-2 sm:px-3 py-2 sm:py-3 text-right font-medium text-gray-700 text-xs sm:text-sm hidden sm:table-cell">آخر تحديث</th>
                  <th className="px-2 sm:px-3 py-2 sm:py-3 text-right font-medium text-gray-700 text-xs sm:text-sm">الحالة</th>
                  <th className="px-2 sm:px-3 py-2 sm:py-3 text-right font-medium text-gray-700 text-xs sm:text-sm">إجراءات</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {safeItems.map((item: StockItem) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-2 sm:px-3 py-3 sm:py-4">
                      <div>
                        <div className="font-medium text-gray-900 text-sm sm:text-base">{item.productName}</div>
                        {item.synonyms && (
                          <div className="text-xs text-gray-500 hidden sm:block">متردفات: {item.synonyms}</div>
                        )}
                      </div>
                    </td>
                    <td className="px-2 sm:px-3 py-3 sm:py-4 text-gray-900 text-sm sm:text-base">{item.initialQuantity}</td>
                    <td className="px-2 sm:px-3 py-3 sm:py-4">
                      <span className={`font-bold text-sm sm:text-base ${
                        item.currentQuantity <= 0 ? 'text-red-600' :
                        item.currentQuantity <= (item.minThreshold || 10) ? 'text-yellow-600' :
                        'text-green-600'
                      }`}>
                        {item.currentQuantity}
                      </span>
                    </td>
                    <td className="px-2 sm:px-3 py-3 sm:py-4 text-gray-900 text-sm sm:text-base">{item.minThreshold || 10}</td>
                    <td className="px-2 sm:px-3 py-3 sm:py-4 text-gray-500 text-xs sm:text-sm hidden sm:table-cell">{item.lastUpdate}</td>
                    <td className="px-2 sm:px-3 py-3 sm:py-4">
                      {item.currentQuantity <= 0 ? (
                        <span className="px-1.5 sm:px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded-full">
                          <span className="hidden sm:inline">نفد المخزون</span>
                          <span className="sm:hidden">نفد</span>
                        </span>
                      ) : item.currentQuantity <= (item.minThreshold || 10) ? (
                        <span className="px-1.5 sm:px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded-full">
                          <span className="hidden sm:inline">مخزون منخفض</span>
                          <span className="sm:hidden">منخفض</span>
                        </span>
                      ) : (
                        <span className="px-1.5 sm:px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full">
                          متوفر
                        </span>
                      )}
                    </td>
                    <td className="px-2 sm:px-3 py-3 sm:py-4">
                      <button
                        onClick={() => onEdit(item)}
                        className="text-blue-600 hover:text-blue-800 text-xs sm:text-sm font-medium"
                      >
                        تعديل
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {safeItems.length === 0 && (
        <div className="text-center py-8 sm:py-12">
          <div className="p-3 sm:p-4 bg-gray-100 rounded-full w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-4 flex items-center justify-center">
            <svg className="w-6 h-6 sm:w-8 sm:h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </div>
          <h3 className="text-base sm:text-lg font-medium text-gray-900 mb-2">لا توجد منتجات في المخزون</h3>
          <p className="text-gray-500 mb-4 text-sm sm:text-base">ابدأ بإضافة منتجات جديدة لإدارة المخزون</p>
          <button
            onClick={onAdd}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm sm:text-base"
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

  const [warnings, setWarnings] = useState<string[]>([]);
  const [errors, setErrors] = useState<string[]>([]);

  // تحديث التحذيرات والأخطاء عند تغيير البيانات
  const validateAndWarn = (newFormData: any) => {
    const newWarnings: string[] = [];
    const newErrors: string[] = [];
    
    const initial = parseInt(newFormData.initialQuantity) || 0;
    const threshold = parseInt(newFormData.minThreshold) || 10;
    
    // التحقق من الأخطاء
    if (initial < 0) {
      newErrors.push('❌ الكمية الأولية لا يمكن أن تكون سالبة');
    }
    
    if (threshold < 0) {
      newErrors.push('❌ الحد الأدنى لا يمكن أن يكون سالباً');
    }
    
    if (threshold > initial && initial > 0) {
      newErrors.push('❌ الحد الأدنى لا يمكن أن يكون أكبر من الكمية الأولية');
    }
    
    // التحذيرات الذكية
    if (initial === 0) {
      newWarnings.push('⚠️ ستقوم بإضافة منتج بمخزون صفر');
    } else if (initial <= threshold) {
      newWarnings.push('🟡 المنتج سيبدأ بمخزون منخفض (أقل من أو يساوي الحد الأدنى)');
    }
    
    if (initial > 1000) {
      newWarnings.push('💡 كمية كبيرة - تأكد من صحة الرقم');
    }
    
    if (threshold === 0) {
      newWarnings.push('💡 الحد الأدنى صفر - لن تحصل على تنبيهات نفاد المخزون');
    }
    
    setWarnings(newWarnings);
    setErrors(newErrors);
  };

  const handleChange = (field: string, value: string) => {
    const newFormData = { ...formData, [field]: value };
    setFormData(newFormData);
    validateAndWarn(newFormData);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // التحقق النهائي
    if (errors.length > 0) {
      alert('يرجى إصلاح الأخطاء قبل المتابعة');
      return;
    }
    
    if (!formData.productName.trim()) {
      alert('اسم المنتج مطلوب');
      return;
    }
    
    const initial = parseInt(formData.initialQuantity) || 0;
    const threshold = parseInt(formData.minThreshold) || 10;
    
    if (initial < 0 || threshold < 0) {
      alert('لا يمكن أن تكون الكميات سالبة');
      return;
    }
    
    if (threshold > initial && initial > 0) {
      alert('الحد الأدنى لا يمكن أن يكون أكبر من الكمية الأولية');
      return;
    }
    
    // تأكيد العملية إذا كان هناك تحذيرات
    if (warnings.length > 0) {
      const confirmMessage = `هناك بعض التحذيرات:\n${warnings.join('\n')}\n\nهل تريد المتابعة؟`;
      if (!window.confirm(confirmMessage)) {
        return;
      }
    }
    
    onSubmit({
      productName: formData.productName.trim(),
      initialQuantity: initial.toString(),
      synonyms: formData.synonyms.trim(),
      minThreshold: threshold.toString()
    });
    
    setFormData({ productName: '', initialQuantity: '', synonyms: '', minThreshold: '10' });
    setWarnings([]);
    setErrors([]);
  };

  const canSubmit = errors.length === 0 && formData.productName.trim() && formData.initialQuantity;

  return (
    <div className="max-w-full sm:max-w-2xl mx-auto px-2 sm:px-0">
      <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-4 sm:mb-6">إضافة منتج جديد</h2>
      
      {/* عرض الأخطاء */}
      {errors.length > 0 && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <h4 className="text-sm font-medium text-red-800 mb-2">أخطاء يجب إصلاحها:</h4>
          {errors.map((error, index) => (
            <p key={index} className="text-xs text-red-700 mb-1">{error}</p>
          ))}
        </div>
      )}
      
      {/* عرض التحذيرات */}
      {warnings.length > 0 && errors.length === 0 && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <h4 className="text-sm font-medium text-yellow-800 mb-2">تنبيهات:</h4>
          {warnings.map((warning, index) => (
            <p key={index} className="text-xs text-yellow-700 mb-1">{warning}</p>
          ))}
        </div>
      )}
      
      <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            اسم المنتج *
            <span className="text-xs text-gray-500 block">الاسم الأساسي للمنتج</span>
          </label>
          <input
            type="text"
            value={formData.productName}
            onChange={(e) => handleChange('productName', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-500 text-sm sm:text-base"
            placeholder="أدخل اسم المنتج"
            required
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              الكمية الأولية *
              <span className="text-xs text-gray-500 block">كمية المخزون عند الإضافة</span>
            </label>
            <input
              type="number"
              value={formData.initialQuantity}
              onChange={(e) => handleChange('initialQuantity', e.target.value)}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-500 text-sm sm:text-base ${
                errors.some(e => e.includes('الكمية الأولية')) ? 'border-red-300 bg-red-50' : 'border-gray-300'
              }`}
              min="0"
              placeholder="0"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              الحد الأدنى للتنبيه
              <span className="text-xs text-gray-500 block">تنبيه عند الوصول لهذا الرقم</span>
            </label>
            <input
              type="number"
              value={formData.minThreshold}
              onChange={(e) => handleChange('minThreshold', e.target.value)}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-500 text-sm sm:text-base ${
                errors.some(e => e.includes('الحد الأدنى')) ? 'border-red-300 bg-red-50' : 'border-gray-300'
              }`}
              min="0"
              placeholder="10"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            المتردفات (اختياري)
            <span className="text-xs text-gray-500 block">أسماء أخرى للمنتج، مفصولة بفاصلة</span>
          </label>
          <input
            type="text"
            value={formData.synonyms}
            onChange={(e) => handleChange('synonyms', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-500 text-sm sm:text-base"
            placeholder="مثال: جوال، هاتف، موبايل"
          />
          <p className="text-xs text-gray-500 mt-1">
            المتردفات تساعد في المطابقة التلقائية مع أسماء المنتجات في الطلبات
          </p>
        </div>

        {/* معاينة المنتج */}
        {formData.productName && formData.initialQuantity && (
          <div className="bg-blue-50 p-3 sm:p-4 rounded-lg border border-blue-200">
            <h4 className="text-sm font-medium text-blue-800 mb-2">📦 معاينة المنتج الجديد:</h4>
            <div className="space-y-1 sm:space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-blue-700">اسم المنتج:</span>
                <span className="font-medium text-blue-900">{formData.productName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-blue-700">المخزون الأولي:</span>
                <span className="font-medium text-blue-900">{formData.initialQuantity} قطعة</span>
              </div>
              <div className="flex justify-between">
                <span className="text-blue-700">الحد الأدنى:</span>
                <span className="font-medium text-blue-900">{formData.minThreshold} قطعة</span>
              </div>
              {formData.synonyms && (
                <div className="flex justify-between">
                  <span className="text-blue-700">المتردفات:</span>
                  <span className="font-medium text-blue-900 text-xs">{formData.synonyms}</span>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isLoading || !canSubmit}
            className="w-full sm:w-auto px-4 sm:px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 font-medium text-sm sm:text-base"
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
    <div className="space-y-4 sm:space-y-6">
      <h2 className="text-lg sm:text-xl font-bold text-gray-900">إدارة المرتجعات والتوالف</h2>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <div className="bg-blue-50 p-4 sm:p-6 rounded-lg border border-blue-200">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-blue-100 rounded-full">
              <svg className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
              </svg>
            </div>
            <h3 className="text-base sm:text-lg font-bold text-blue-900">المرتجعات</h3>
          </div>
          <p className="text-blue-700 mb-4 text-sm sm:text-base">تسجيل المنتجات المرتجعة من العملاء</p>
          <button
            onClick={onAddReturn}
            className="w-full px-3 sm:px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm sm:text-base"
          >
            تسجيل مرتجع
          </button>
        </div>

        <div className="bg-red-50 p-4 sm:p-6 rounded-lg border border-red-200">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-red-100 rounded-full">
              <svg className="w-5 h-5 sm:w-6 sm:h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>
            <h3 className="text-base sm:text-lg font-bold text-red-900">التوالف والمفقودات</h3>
          </div>
          <p className="text-red-700 mb-4 text-sm sm:text-base">تسجيل المنتجات التالفة أو المفقودة</p>
          <button
            onClick={onAddDamage}
            className="w-full px-3 sm:px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm sm:text-base"
          >
            تسجيل تالف/مفقود
          </button>
        </div>
      </div>
    </div>
  );
}

function StockReports({ reports, stockItems }: any) {
  // التأكد من أن stockItems هو array
  const safeItems = Array.isArray(stockItems) ? stockItems : [];
  
  if (!reports) {
    return (
      <div className="flex items-center justify-center h-32 sm:h-64">
        <div className="animate-spin rounded-full h-8 w-8 sm:h-12 sm:w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <h2 className="text-lg sm:text-xl font-bold text-gray-900">تقارير المخزون</h2>
      
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
        <div className="bg-green-50 p-4 sm:p-6 rounded-lg border border-green-200">
          <h3 className="font-bold text-green-900 mb-2 text-sm sm:text-base">منتجات متوفرة</h3>
          <p className="text-2xl sm:text-3xl font-bold text-green-700">{reports.byStatus?.inStock || 0}</p>
          <p className="text-xs sm:text-sm text-green-600">مخزون جيد</p>
        </div>

        <div className="bg-yellow-50 p-4 sm:p-6 rounded-lg border border-yellow-200">
          <h3 className="font-bold text-yellow-900 mb-2 text-sm sm:text-base">مخزون منخفض</h3>
          <p className="text-2xl sm:text-3xl font-bold text-yellow-700">{reports.byStatus?.lowStock || 0}</p>
          <p className="text-xs sm:text-sm text-yellow-600">يحتاج إعادة تموين</p>
        </div>

        <div className="bg-red-50 p-4 sm:p-6 rounded-lg border border-red-200">
          <h3 className="font-bold text-red-900 mb-2 text-sm sm:text-base">نفد المخزون</h3>
          <p className="text-2xl sm:text-3xl font-bold text-red-700">{reports.byStatus?.outOfStock || 0}</p>
          <p className="text-xs sm:text-sm text-red-600">يحتاج تموين فوري</p>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200">
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200">
          <h3 className="text-base sm:text-lg font-medium text-gray-900">تفاصيل المنتجات</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-2 sm:px-3 py-2 sm:py-3 text-right font-medium text-gray-700 text-xs sm:text-sm min-w-[120px]">المنتج</th>
                <th className="px-2 sm:px-3 py-2 sm:py-3 text-right font-medium text-gray-700 text-xs sm:text-sm">المخزون الحالي</th>
                <th className="px-2 sm:px-3 py-2 sm:py-3 text-right font-medium text-gray-700 text-xs sm:text-sm">المباع</th>
                <th className="px-2 sm:px-3 py-2 sm:py-3 text-right font-medium text-gray-700 text-xs sm:text-sm hidden sm:table-cell">المعدل</th>
                <th className="px-2 sm:px-3 py-2 sm:py-3 text-right font-medium text-gray-700 text-xs sm:text-sm">الحالة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {safeItems.map((item: StockItem) => {
                const sold = item.initialQuantity - item.currentQuantity;
                const turnoverRate = item.initialQuantity > 0 ? ((sold / item.initialQuantity) * 100).toFixed(1) : '0';
                
                return (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-2 sm:px-3 py-3 sm:py-4 font-medium text-gray-900 text-sm">{item.productName}</td>
                    <td className="px-2 sm:px-3 py-3 sm:py-4 text-sm">{item.currentQuantity}</td>
                    <td className="px-2 sm:px-3 py-3 sm:py-4 text-sm">{sold}</td>
                    <td className="px-2 sm:px-3 py-3 sm:py-4 text-sm hidden sm:table-cell">{turnoverRate}%</td>
                    <td className="px-2 sm:px-3 py-3 sm:py-4">
                      {item.currentQuantity <= 0 ? (
                        <span className="px-1.5 sm:px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded-full">
                          نفد
                        </span>
                      ) : item.currentQuantity <= (item.minThreshold || 10) ? (
                        <span className="px-1.5 sm:px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded-full">
                          منخفض
                        </span>
                      ) : (
                        <span className="px-1.5 sm:px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full">
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

      <p className="text-xs sm:text-sm text-gray-500 text-center">
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
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-500"
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
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-500"
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
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-500"
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
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-500"
              placeholder="مثال: جوال، هاتف، موبايل"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={onClose} className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium">
              إلغاء
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 font-medium"
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

function ReturnModal({ stockItems, onClose, onSubmit, isLoading }: any) { 
  const [formData, setFormData] = useState({
    productName: '',
    quantity: '',
    reason: 'other',
    notes: ''
  });

  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [previewQuantity, setPreviewQuantity] = useState(0);

  const handleProductChange = (productName: string) => {
    const product = stockItems.find((item: any) => item.productName === productName);
    setSelectedProduct(product);
    setFormData({...formData, productName});
    updatePreview(formData.quantity, product);
  };

  const handleQuantityChange = (quantity: string) => {
    setFormData({...formData, quantity});
    updatePreview(quantity, selectedProduct);
  };

  const updatePreview = (quantity: string, product: any) => {
    if (product && quantity) {
      const qty = parseInt(quantity) || 0;
      setPreviewQuantity(product.currentQuantity + qty);
    } else {
      setPreviewQuantity(0);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const quantity = parseInt(formData.quantity) || 0;
    
    if (quantity <= 0) {
      alert('كمية المرتجع يجب أن تكون أكبر من صفر');
      return;
    }
    
    if (!selectedProduct) {
      alert('يجب اختيار المنتج');
      return;
    }
    
    // تأكيد العملية
    const confirmMessage = `هل تريد تسجيل مرتجع ${quantity} قطعة من ${selectedProduct.productName}؟\n\nالمخزون الحالي: ${selectedProduct.currentQuantity}\nبعد المرتجع: ${previewQuantity}`;
    
    if (window.confirm(confirmMessage)) {
      onSubmit(formData);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full flex items-center justify-center z-50 p-4">
      <div className="relative p-4 sm:p-8 bg-white w-full max-w-md mx-auto rounded-lg shadow-lg">
        <div className="flex justify-between items-center mb-4 sm:mb-6">
          <h3 className="text-lg sm:text-xl font-bold text-gray-900">تسجيل مرتجع</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl sm:text-2xl font-bold">×</button>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">اسم المنتج</label>
            <select
              value={formData.productName}
              onChange={(e) => handleProductChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 text-sm"
              required
            >
              <option value="">اختر المنتج</option>
              {stockItems.map((item: any) => (
                <option key={item.id} value={item.productName} className="text-gray-900 bg-white">
                  {item.productName} (متوفر: {item.currentQuantity})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">الكمية المرتجعة</label>
            <input
              type="number"
              value={formData.quantity}
              onChange={(e) => handleQuantityChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-500 text-sm"
              min="1"
              placeholder="أدخل الكمية المرتجعة"
              required
            />
          </div>

          {/* معاينة تأثير العملية */}
          {selectedProduct && formData.quantity && (
            <div className="bg-green-50 p-3 rounded-lg border border-green-200">
              <h4 className="text-sm font-medium text-green-800 mb-2">📈 معاينة تأثير المرتجع:</h4>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-green-700">المخزون الحالي:</span>
                  <span className="font-medium text-green-900">{selectedProduct.currentQuantity}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-green-700">الكمية المرتجعة:</span>
                  <span className="font-medium text-green-600">+{formData.quantity}</span>
                </div>
                <hr className="border-green-200" />
                <div className="flex justify-between font-bold">
                  <span className="text-green-800">المخزون الجديد:</span>
                  <span className="text-green-800">{previewQuantity}</span>
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">سبب المرتجع</label>
            <select
              value={formData.reason}
              onChange={(e) => setFormData({...formData, reason: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 text-sm"
            >
              <option value="damaged_shipping" className="text-gray-900 bg-white">تلف أثناء الشحن</option>
              <option value="customer_damage" className="text-gray-900 bg-white">تلف من العميل</option>
              <option value="other" className="text-gray-900 bg-white">أخرى</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ملاحظات</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({...formData, notes: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-500 text-sm"
              rows={3}
              placeholder="تفاصيل إضافية عن سبب المرتجع..."
            />
          </div>

          <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4">
            <button type="button" onClick={onClose} className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium text-sm order-2 sm:order-1">
              إلغاء
            </button>
            <button
              type="submit"
              disabled={isLoading || !selectedProduct || !formData.quantity}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 font-medium text-sm order-1 sm:order-2"
            >
              {isLoading && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>}
              تسجيل المرتجع
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DamageModal({ stockItems, onClose, onSubmit, isLoading }: any) { 
  const [formData, setFormData] = useState({
    productName: '',
    quantity: '',
    type: 'damage',
    reason: 'تلف أثناء الشحن',
    notes: ''
  });

  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [previewQuantity, setPreviewQuantity] = useState(0);
  const [error, setError] = useState('');

  const handleProductChange = (productName: string) => {
    const product = stockItems.find((item: any) => item.productName === productName);
    setSelectedProduct(product);
    setFormData({...formData, productName});
    updatePreview(formData.quantity, product);
    setError('');
  };

  const handleQuantityChange = (quantity: string) => {
    setFormData({...formData, quantity});
    updatePreview(quantity, selectedProduct);
  };

  const updatePreview = (quantity: string, product: any) => {
    if (product && quantity) {
      const qty = parseInt(quantity) || 0;
      const newQty = Math.max(0, product.currentQuantity - qty);
      setPreviewQuantity(newQty);
      
      // التحقق من كفاية المخزون
      if (qty > product.currentQuantity) {
        setError(`المخزون غير كافي! المتوفر: ${product.currentQuantity}, المطلوب: ${qty}`);
      } else {
        setError('');
      }
    } else {
      setPreviewQuantity(0);
      setError('');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const quantity = parseInt(formData.quantity) || 0;
    
    if (quantity <= 0) {
      alert('كمية التالف يجب أن تكون أكبر من صفر');
      return;
    }
    
    if (!selectedProduct) {
      alert('يجب اختيار المنتج');
      return;
    }
    
    if (quantity > selectedProduct.currentQuantity) {
      alert(`المخزون غير كافي! المتوفر: ${selectedProduct.currentQuantity}`);
      return;
    }
    
    // تأكيد العملية
    const confirmMessage = `⚠️ تحذير: هل تريد تسجيل تالف ${quantity} قطعة من ${selectedProduct.productName}؟\n\nسيتم خصم هذه الكمية من المخزون نهائياً.\n\nالمخزون الحالي: ${selectedProduct.currentQuantity}\nبعد التالف: ${previewQuantity}`;
    
    if (window.confirm(confirmMessage)) {
      onSubmit(formData);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full flex items-center justify-center z-50 p-4">
      <div className="relative p-4 sm:p-8 bg-white w-full max-w-md mx-auto rounded-lg shadow-lg">
        <div className="flex justify-between items-center mb-4 sm:mb-6">
          <h3 className="text-lg sm:text-xl font-bold text-gray-900">تسجيل تالف/مفقود</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl sm:text-2xl font-bold">×</button>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">اسم المنتج</label>
            <select
              value={formData.productName}
              onChange={(e) => handleProductChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent bg-white text-gray-900 text-sm"
              required
            >
              <option value="">اختر المنتج</option>
              {stockItems.map((item: any) => (
                <option key={item.id} value={item.productName} className="text-gray-900 bg-white">
                  {item.productName} (متوفر: {item.currentQuantity})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">الكمية التالفة/المفقودة</label>
            <input
              type="number"
              value={formData.quantity}
              onChange={(e) => handleQuantityChange(e.target.value)}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-500 text-sm ${
                error ? 'border-red-300 bg-red-50' : 'border-gray-300'
              }`}
              min="1"
              max={selectedProduct?.currentQuantity || 0}
              placeholder="أدخل الكمية التالفة"
              required
            />
            {error && (
              <p className="text-red-600 text-xs mt-1">{error}</p>
            )}
          </div>

          {/* معاينة تأثير العملية */}
          {selectedProduct && formData.quantity && !error && (
            <div className="bg-red-50 p-3 rounded-lg border border-red-200">
              <h4 className="text-sm font-medium text-red-800 mb-2">📉 معاينة تأثير التالف:</h4>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-red-700">المخزون الحالي:</span>
                  <span className="font-medium text-red-900">{selectedProduct.currentQuantity}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-red-700">الكمية التالفة:</span>
                  <span className="font-medium text-red-600">-{formData.quantity}</span>
                </div>
                <hr className="border-red-200" />
                <div className="flex justify-between font-bold">
                  <span className="text-red-800">المخزون الجديد:</span>
                  <span className="text-red-800">{previewQuantity}</span>
                </div>
                {previewQuantity <= (selectedProduct.minThreshold || 10) && (
                  <div className="text-xs text-red-600 mt-2">
                    ⚠️ تحذير: المخزون سيصل للحد الأدنى أو أقل
                  </div>
                )}
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">نوع التلف</label>
            <select
              value={formData.reason}
              onChange={(e) => setFormData({...formData, reason: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent bg-white text-gray-900 text-sm"
            >
              <option value="تلف أثناء الشحن" className="text-gray-900 bg-white">تلف أثناء الشحن</option>
              <option value="فقدان" className="text-gray-900 bg-white">فقدان</option>
              <option value="تلف من العميل" className="text-gray-900 bg-white">تلف من العميل</option>
              <option value="تلف في المخزن" className="text-gray-900 bg-white">تلف في المخزن</option>
              <option value="انتهاء صلاحية" className="text-gray-900 bg-white">انتهاء صلاحية</option>
              <option value="أخرى" className="text-gray-900 bg-white">أخرى</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ملاحظات</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({...formData, notes: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-500 text-sm"
              rows={3}
              placeholder="تفاصيل إضافية عن سبب التلف أو الفقدان..."
            />
          </div>

          <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4">
            <button type="button" onClick={onClose} className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium text-sm order-2 sm:order-1">
              إلغاء
            </button>
            <button
              type="submit"
              disabled={isLoading || !selectedProduct || !formData.quantity || !!error}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2 font-medium text-sm order-1 sm:order-2"
            >
              {isLoading && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>}
              تسجيل التالف
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditItemModal({ item, onClose, onSubmit, isLoading }: any) { 
  const [formData, setFormData] = useState({
    id: item?.id || '',
    productName: item?.productName || '',
    initialQuantity: item?.initialQuantity?.toString() || '',
    currentQuantity: item?.currentQuantity?.toString() || '',
    synonyms: item?.synonyms || '',
    minThreshold: item?.minThreshold?.toString() || '10'
  });

  const [warnings, setWarnings] = useState<string[]>([]);

  // تحديث التحذيرات عند تغيير البيانات
  const updateWarnings = (newFormData: any) => {
    const newWarnings: string[] = [];
    const initial = parseInt(newFormData.initialQuantity) || 0;
    const current = parseInt(newFormData.currentQuantity) || 0;
    const threshold = parseInt(newFormData.minThreshold) || 10;
    
    if (current > initial) {
      newWarnings.push('⚠️ الكمية الحالية أكبر من الأولية (ربما بسبب المرتجعات)');
    }
    
    if (current <= threshold && current > 0) {
      newWarnings.push('🟡 المخزون منخفض - أقل من الحد الأدنى');
    }
    
    if (current === 0) {
      newWarnings.push('🔴 المخزون منتهي - الكمية صفر');
    }
    
    if (threshold > initial) {
      newWarnings.push('⚠️ الحد الأدنى أكبر من الكمية الأولية');
    }
    
    const sold = initial - current;
    if (sold > 0) {
      newWarnings.push(`📊 تم بيع ${sold} قطعة من هذا المنتج`);
    }
    
    setWarnings(newWarnings);
  };

  const handleChange = (field: string, value: string) => {
    const newFormData = { ...formData, [field]: value };
    setFormData(newFormData);
    updateWarnings(newFormData);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const initial = parseInt(formData.initialQuantity) || 0;
    const current = parseInt(formData.currentQuantity) || 0;
    const threshold = parseInt(formData.minThreshold) || 10;
    
    // التحقق من صحة البيانات
    if (initial < 0 || current < 0 || threshold < 0) {
      alert('لا يمكن أن تكون أي من الكميات سالبة');
      return;
    }
    
    onSubmit({
      ...formData,
      initialQuantity: initial,
      currentQuantity: current,
      minThreshold: threshold
    });
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full flex items-center justify-center z-50 p-4">
      <div className="relative p-4 sm:p-8 bg-white w-full max-w-lg mx-auto rounded-lg shadow-lg">
        <div className="flex justify-between items-center mb-4 sm:mb-6">
          <h3 className="text-lg sm:text-xl font-bold text-gray-900">تعديل المنتج</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl sm:text-2xl font-bold">×</button>
        </div>
        
        {/* عرض التحذيرات */}
        {warnings.length > 0 && (
          <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <h4 className="text-sm font-medium text-yellow-800 mb-2">تنبيهات:</h4>
            {warnings.map((warning, index) => (
              <p key={index} className="text-xs text-yellow-700 mb-1">{warning}</p>
            ))}
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">اسم المنتج</label>
            <input
              type="text"
              value={formData.productName}
              onChange={(e) => handleChange('productName', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-500 text-sm"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                الكمية الأولية
                <span className="text-xs text-gray-500 block">عند إضافة المنتج أول مرة</span>
              </label>
              <input
                type="number"
                value={formData.initialQuantity}
                onChange={(e) => handleChange('initialQuantity', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-500 text-sm"
                min="0"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                المخزون الحالي
                <span className="text-xs text-gray-500 block">بعد البيع والمرتجعات</span>
              </label>
              <input
                type="number"
                value={formData.currentQuantity}
                onChange={(e) => handleChange('currentQuantity', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-500 text-sm"
                min="0"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              الحد الأدنى للتنبيه
              <span className="text-xs text-gray-500 block">تنبيه عند الوصول لهذا الرقم</span>
            </label>
            <input
              type="number"
              value={formData.minThreshold}
              onChange={(e) => handleChange('minThreshold', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-500 text-sm"
              min="0"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              المتردفات
              <span className="text-xs text-gray-500 block">أسماء أخرى للمنتج (مفصولة بفاصلة)</span>
            </label>
            <input
              type="text"
              value={formData.synonyms}
              onChange={(e) => handleChange('synonyms', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-500 text-sm"
              placeholder="مثال: جوال، هاتف، موبايل"
            />
          </div>

          {/* إحصائيات سريعة */}
          <div className="bg-gray-50 p-3 rounded-lg">
            <h4 className="text-sm font-medium text-gray-700 mb-2">إحصائيات سريعة:</h4>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-gray-600">المباع: </span>
                <span className="font-medium text-gray-900">{Math.max(0, parseInt(formData.initialQuantity || '0') - parseInt(formData.currentQuantity || '0'))}</span>
              </div>
              <div>
                <span className="text-gray-600">معدل البيع: </span>
                <span className="font-medium text-gray-900">
                  {parseInt(formData.initialQuantity || '0') > 0 
                    ? `${(((parseInt(formData.initialQuantity || '0') - parseInt(formData.currentQuantity || '0')) / parseInt(formData.initialQuantity || '1')) * 100).toFixed(1)}%`
                    : '0%'
                  }
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4">
            <button type="button" onClick={onClose} className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium text-sm order-2 sm:order-1">
              إلغاء
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2 font-medium text-sm order-1 sm:order-2"
            >
              {isLoading && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>}
              حفظ التعديل
            </button>
          </div>
        </form>
      </div>
    </div>
  );
} 