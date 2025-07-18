import React, { useState, useMemo } from 'react';
import StatusBadge from './StatusBadge';
import WhatsAppTemplates from './WhatsAppTemplates';
import { testPhoneFormatter, formatPhoneForDisplay } from '../lib/phoneFormatter';
import { cleanText, getUniqueProducts, compareCleanText, testProductCleaning, analyzeOrderStatuses, testStatusFilter } from '../lib/textCleaner';

interface Order {
  id: number;
  rowIndex: number;
  orderDate: string;
  name: string;
  phone: string;
  whatsapp: string;
  governorate: string;
  area: string;
  address: string;
  orderDetails: string;
  quantity: string;
  totalPrice: string;
  productName: string;
  source: string;
  status: string;
  notes: string;
  whatsappSent: string;
}

interface OrdersTableProps {
  orders: Order[];
  onUpdateOrder: (id: number, updates: Partial<Order>) => Promise<void>;
}

const statuses = [
  'جديد',
  'تم التأكيد',
  'في انتظار تأكيد العميل',
  'رفض التأكيد',
  'لم يرد',
  'تم التواصل معه واتساب',
  'تم الشحن',
];

export default function OrdersTable({ orders, onUpdateOrder }: OrdersTableProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [productFilter, setProductFilter] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingNotes, setEditingNotes] = useState('');
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [loadingOrders, setLoadingOrders] = useState<Set<number>>(new Set());
  const [optimisticUpdates, setOptimisticUpdates] = useState<Map<number, Partial<Order>>>(new Map());
  const [showSuccessMessage, setShowSuccessMessage] = useState<number | null>(null);
  const [copySuccess, setCopySuccess] = useState('');
  
  // حالات التحديد الجماعي
  const [selectedOrders, setSelectedOrders] = useState<Set<number>>(new Set());
  const [bulkStatusModalOpen, setBulkStatusModalOpen] = useState(false);
  const [isBulkLoading, setIsBulkLoading] = useState(false);
  const [bulkSuccessMessage, setBulkSuccessMessage] = useState('');
  
  // للتحكم في تشغيل التحليل مرة واحدة فقط
  const statusAnalysisDone = React.useRef(false);
  const productAnalysisDone = React.useRef(false);

  // إعادة تعيين التحديدات عند تغيير الفلاتر
  React.useEffect(() => {
    setSelectedOrders(new Set());
  }, [searchTerm, statusFilter, sourceFilter, productFilter]);

  const getOrderWithUpdates = (order: Order) => {
    const updates = optimisticUpdates.get(order.id);
    return updates ? { ...order, ...updates } : order;
  };

  // دوال التحديد الجماعي
  const handleSelectOrder = (orderId: number) => {
    setSelectedOrders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(orderId)) {
        newSet.delete(orderId);
      } else {
        newSet.add(orderId);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    const allVisibleOrderIds = new Set(filteredOrders.map(order => order.id));
    setSelectedOrders(allVisibleOrderIds);
  };

  const handleDeselectAll = () => {
    setSelectedOrders(new Set());
  };

  const handleBulkStatusUpdate = async (newStatus: string) => {
    if (selectedOrders.size === 0) {
      alert('يرجى تحديد طلب واحد على الأقل');
      return;
    }

    setIsBulkLoading(true);
    setBulkStatusModalOpen(false);

    try {
      // تحديث جميع الطلبات المحددة
      const updatePromises = Array.from(selectedOrders).map(orderId => 
        onUpdateOrder(orderId, { status: newStatus })
      );

      await Promise.all(updatePromises);
      
      // إظهار رسالة نجاح
      setBulkSuccessMessage(`تم تحديث ${selectedOrders.size} طلب بنجاح إلى حالة "${newStatus}"`);
      setTimeout(() => setBulkSuccessMessage(''), 5000);
      
      // إلغاء التحديد
      setSelectedOrders(new Set());
      
    } catch (error) {
      console.error('Failed to update orders:', error);
      alert('فشل في تحديث بعض الطلبات. حاول مرة أخرى.');
    } finally {
      setIsBulkLoading(false);
    }
  };

  const filteredOrders = useMemo(() => {
    const results = orders.filter(order => {
      // الحصول على الطلب مع التحديثات التفاؤلية
      const orderWithUpdates = getOrderWithUpdates(order);
      
      const matchesSearch = !searchTerm || 
        orderWithUpdates.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        orderWithUpdates.phone.includes(searchTerm) ||
        orderWithUpdates.whatsapp.includes(searchTerm);
      
      // تحسين فلتر الحالة للتعامل مع القيم الفارغة والمسافات
      const orderStatus = (orderWithUpdates.status || 'جديد').trim();
      const selectedStatus = statusFilter.trim();
      
      // معالجة خاصة للحالات الفارغة
      let matchesStatus = false;
      if (!selectedStatus) {
        // إذا لم يكن هناك فلتر محدد، أظهر كل الطلبات
        matchesStatus = true;
      } else if (selectedStatus === 'جديد') {
        // إذا كان الفلتر "جديد"، أظهر الطلبات الجديدة أو التي بدون حالة
        matchesStatus = orderStatus === 'جديد' || !orderWithUpdates.status;
      } else {
        // للحالات الأخرى، طابق تماماً
        matchesStatus = orderStatus === selectedStatus;
      }
      
      const matchesSource = !sourceFilter || orderWithUpdates.source === sourceFilter;
      const matchesProduct = !productFilter || cleanText(orderWithUpdates.productName) === productFilter;
      
      // Debug info for status filter
      if (process.env.NODE_ENV === 'development' && statusFilter) {
        let matchType = '';
        if (!selectedStatus) {
          matchType = 'no filter';
        } else if (selectedStatus === 'جديد' && !orderWithUpdates.status) {
          matchType = 'empty status treated as جديد';
        } else if (orderStatus === selectedStatus) {
          matchType = 'exact match';
        } else {
          matchType = 'no match';
        }
        
        console.log('Status Filter Debug:', {
          orderId: orderWithUpdates.id,
          orderStatus: `"${orderStatus}"`,
          selectedStatus: `"${selectedStatus}"`,
          matchesStatus,
          matchType,
          originalStatus: `"${order.status}"`,
          updatedStatus: `"${orderWithUpdates.status}"`,
          isEmptyOriginal: !order.status,
          isEmptyUpdated: !orderWithUpdates.status
        });
      }
      
      return matchesSearch && matchesStatus && matchesSource && matchesProduct;
    });
    
    // معلومات إضافية عن نتائج الفلتر
    if (process.env.NODE_ENV === 'development') {
      console.log('\n🔢 نتائج الفلتر:');
      console.log(`إجمالي الطلبات: ${orders.length}`);
      console.log(`الطلبات المفلترة: ${results.length}`);
      console.log(`فلاتر نشطة:`);
      console.log(`  - البحث: ${searchTerm ? `"${searchTerm}"` : 'غير نشط'}`);
      console.log(`  - الحالة: ${statusFilter ? `"${statusFilter}"` : 'غير نشط'}`);
      console.log(`  - المصدر: ${sourceFilter ? `"${sourceFilter}"` : 'غير نشط'}`);
      console.log(`  - المنتج: ${productFilter ? `"${productFilter}"` : 'غير نشط'}`);
      
      if (statusFilter && results.length === 0) {
        console.log('⚠️ فلتر الحالة لا يُظهر أي نتائج!');
        const statusMatches = orders.filter(order => {
          const orderStatus = (order.status || 'جديد').trim();
          return orderStatus === statusFilter.trim();
        });
        console.log(`طلبات تطابق الحالة بدون فلاتر أخرى: ${statusMatches.length}`);
      }
    }
    
    return results;
  }, [orders, searchTerm, statusFilter, sourceFilter, productFilter, optimisticUpdates]);

  // مفاتيح الاختصار للعمليات الجماعية
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ctrl+A لتحديد الكل
      if (event.ctrlKey && event.key === 'a' && filteredOrders.length > 0) {
        event.preventDefault();
        handleSelectAll();
      }
      // Escape لإلغاء التحديد
      if (event.key === 'Escape' && selectedOrders.size > 0) {
        handleDeselectAll();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [filteredOrders.length, selectedOrders.size]);

  const sources = [...new Set(orders.map(o => o.source).filter(Boolean))];
  
  // استخدام الدالة المشتركة لإنشاء قائمة منتجات نظيفة ومرتبة
  const products = useMemo(() => {
    const uniqueProducts = getUniqueProducts(orders);
    
    // Debug: إذا كان لا يزال هناك تكرار، سنطبع تفاصيل في الكونسول
    if (process.env.NODE_ENV === 'development') {
      // تحليل حالات الطلبات (فقط مرة واحدة عند التحميل)
      if (!statusAnalysisDone.current) {
        console.log('\n📊 تحليل شامل لحالات الطلبات:');
        analyzeOrderStatuses(orders);
        statusAnalysisDone.current = true;
      }
      
      // اختبار فلتر الحالة إذا كان محدد
      if (statusFilter) {
        console.log(`\n🔍 اختبار فلتر الحالة: "${statusFilter}"`);
        testStatusFilter(orders, statusFilter);
      }
      
      // تشغيل اختبار تنظيف المنتجات (فقط مرة واحدة)
      if (!productAnalysisDone.current) {
        testProductCleaning();
        productAnalysisDone.current = true;
      }
      
      const originalProducts = orders.map(o => o.productName).filter(Boolean);
      const originalUnique = [...new Set(originalProducts)];
      
      // فحص خاص للمنتج المذكور من المستخدم
      const k19Products = originalProducts.filter(p => 
        p.toLowerCase().includes('موبايل') && 
        p.toLowerCase().includes('k19')
      );
      
      if (k19Products.length > 0) {
        console.log('\n🔍 تحليل خاص لمنتج "موبايل المهام الخاصة K19":');
        console.log('الأشكال الموجودة:', k19Products);
        k19Products.forEach((product, i) => {
          console.log(`${i + 1}. "${product}" → "${cleanText(product)}"`);
        });
        
        const cleanedK19 = [...new Set(k19Products.map(cleanText))];
        console.log('الأشكال المنظفة الفريدة:', cleanedK19);
        
        if (cleanedK19.length > 1) {
          console.log('❌ لا يزال هناك تكرار في هذا المنتج!');
        } else {
          console.log('✅ تم توحيد المنتج بنجاح');
        }
      }
      
      if (originalUnique.length !== uniqueProducts.length) {
        console.log('🚨 تم اكتشاف تكرار في أسماء المنتجات!');
        console.log('عدد المنتجات الأصلية الفريدة:', originalUnique.length);
        console.log('عدد المنتجات المنظفة الفريدة:', uniqueProducts.length);
        console.log('المنتجات الأصلية:', originalUnique);
        console.log('المنتجات المنظفة:', uniqueProducts);
        
        // تحليل مفصل
        const duplicateAnalysis = new Map<string, string[]>();
        orders.forEach(order => {
          const original = order.productName || '';
          const cleaned = cleanText(original);
          
          if (!duplicateAnalysis.has(cleaned)) {
            duplicateAnalysis.set(cleaned, []);
          }
          if (!duplicateAnalysis.get(cleaned)!.includes(original)) {
            duplicateAnalysis.get(cleaned)!.push(original);
          }
        });
        
        duplicateAnalysis.forEach((originals, cleaned) => {
          if (originals.length > 1) {
            console.log(`\n�� المنتج المنظف: "${cleaned}"`);
            console.log('الأشكال المختلفة:');
            originals.forEach((original, i) => {
              console.log(`  ${i + 1}. "${original}" (طول: ${original.length})`);
              console.log(`     رموز: ${original.split('').map(c => c.charCodeAt(0)).join(', ')}`);
            });
          }
        });
      }
    }
    
    return uniqueProducts;
  }, [orders]);

  const formatPhoneNumber = (phone: string) => {
    if (!phone) return '';
    return phone.startsWith('+') ? phone.substring(1) : phone;
  };

  const handleStatusChange = async (orderId: number, newStatus: string) => {
    // Optimistic update
    setOptimisticUpdates(prev => new Map(prev.set(orderId, { status: newStatus })));
    setLoadingOrders(prev => new Set(prev.add(orderId)));

    try {
      console.log(`Updating order ID ${orderId} to status: ${newStatus}`);
      await onUpdateOrder(orderId, { status: newStatus });
      
      // Show success feedback
      setShowSuccessMessage(orderId);
      setTimeout(() => setShowSuccessMessage(null), 2000);
      
      // Clear optimistic update after successful save
      setOptimisticUpdates(prev => {
        const newMap = new Map(prev);
        newMap.delete(orderId);
        return newMap;
      });
    } catch (error) {
      console.error(`Failed to update order ${orderId}:`, error);
      // Revert optimistic update on error
      setOptimisticUpdates(prev => {
        const newMap = new Map(prev);
        newMap.delete(orderId);
        return newMap;
      });
      alert(`فشل في تحديث حالة الطلب رقم ${orderId}. حاول مرة أخرى.`);
    } finally {
      setLoadingOrders(prev => {
        const newSet = new Set(prev);
        newSet.delete(orderId);
        return newSet;
      });
    }
  };

  const handleNotesUpdate = async (orderId: number) => {
    setLoadingOrders(prev => new Set(prev.add(orderId)));
    
    try {
      await onUpdateOrder(orderId, { notes: editingNotes });
      setEditingId(null);
      setEditingNotes('');
      
      setShowSuccessMessage(orderId);
      setTimeout(() => setShowSuccessMessage(null), 2000);
    } catch (error) {
      alert('فشل في تحديث الملاحظات. حاول مرة أخرى.');
    } finally {
      setLoadingOrders(prev => {
        const newSet = new Set(prev);
        newSet.delete(orderId);
        return newSet;
      });
    }
  };

  const openEditModal = (order: Order) => {
    setEditingOrder({ ...order });
    setEditModalOpen(true);
  };

  const handleUpdateField = (field: keyof Order, value: string) => {
    if (editingOrder) {
      setEditingOrder({ ...editingOrder, [field]: value });
    }
  };

  const saveOrder = async () => {
    if (!editingOrder) return;
    
    setLoadingOrders(prev => new Set(prev.add(editingOrder.id)));
    
    try {
      await onUpdateOrder(editingOrder.id, editingOrder);
      setEditModalOpen(false);
      setEditingOrder(null);
      
      setShowSuccessMessage(editingOrder.id);
      setTimeout(() => setShowSuccessMessage(null), 2000);
    } catch (error) {
      alert('فشل في حفظ التغييرات. حاول مرة أخرى.');
    } finally {
      setLoadingOrders(prev => {
        const newSet = new Set(prev);
        newSet.delete(editingOrder.id);
        return newSet;
      });
    }
  };

  const handleCopy = (text: string) => {
    const localFormat = formatPhoneForDisplay(text);
    navigator.clipboard.writeText(localFormat).then(() => {
      setCopySuccess(`تم نسخ "${localFormat}"`);
      setTimeout(() => setCopySuccess(''), 2000);
    }, (err) => {
      console.error('Could not copy text: ', err);
    });
  };

  return (
    <>
      {/* Success Toast */}
      {copySuccess && (
        <div className="fixed bottom-6 left-6 bg-gradient-to-r from-green-500 to-green-600 text-white px-6 py-3 rounded-xl shadow-lg animate-pulse z-50">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            {copySuccess}
          </div>
        </div>
      )}

      {/* Bulk Success Toast */}
      {bulkSuccessMessage && (
        <div className="fixed bottom-6 left-6 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white px-6 py-4 rounded-xl shadow-lg animate-bounce z-50 max-w-md">
          <div className="flex items-center gap-3">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="font-medium">تم التحديث بنجاح!</p>
              <p className="text-sm opacity-90">{bulkSuccessMessage}</p>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Loading Overlay */}
      {isBulkLoading && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 shadow-2xl flex flex-col items-center gap-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            <p className="text-gray-700 font-medium">جاري تحديث الطلبات...</p>
            <p className="text-sm text-gray-500">يرجى الانتظار</p>
          </div>
        </div>
      )}

      {/* Main Container */}
      <div className="bg-white shadow-xl rounded-2xl overflow-hidden border border-gray-100">
        {/* Enhanced Filters Section */}
        <div className="bg-gradient-to-r from-gray-50 to-blue-50 border-b border-gray-200 p-6">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-800">البحث</label>
              <div className="relative">
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                  <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <input
                  type="text"
                  placeholder="بحث بالاسم أو الهاتف..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pr-10 pl-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 bg-white shadow-sm"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-800">الحالة</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 bg-white shadow-sm text-gray-900"
              >
                <option value="">كل الحالات</option>
                {statuses.map(status => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-800">المصدر</label>
              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 bg-white shadow-sm text-gray-900"
              >
                <option value="">كل المصادر</option>
                {sources.map(source => (
                  <option key={source} value={source}>{source}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-800">المنتج</label>
              <select
                value={productFilter}
                onChange={(e) => setProductFilter(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 bg-white shadow-sm text-gray-900"
              >
                <option value="">كل المنتجات</option>
                {products.map(product => (
                  <option key={product} value={product}>{product}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <div className="bg-white px-4 py-3 rounded-xl shadow-sm border border-gray-200">
                <div className="text-sm text-gray-800">
                  <span className="font-medium text-blue-800">{filteredOrders.length}</span> من <span className="font-medium text-gray-900">{orders.length}</span> طلب
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* شريط العمليات الجماعية */}
        {filteredOrders.length > 0 && (
          <div className="bg-white border-b border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                    <input
                      type="checkbox"
                      checked={selectedOrders.size === filteredOrders.length && filteredOrders.length > 0}
                      onChange={selectedOrders.size === filteredOrders.length ? handleDeselectAll : handleSelectAll}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    تحديد الكل ({filteredOrders.length})
                  </label>
                </div>
                
                {selectedOrders.size > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-blue-600 font-medium">
                      تم تحديد {selectedOrders.size} طلب
                    </span>
                    <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-blue-500 transition-all duration-300"
                        style={{ width: `${(selectedOrders.size / filteredOrders.length) * 100}%` }}
                      ></div>
                    </div>
                    <button
                      onClick={handleDeselectAll}
                      className="text-sm text-gray-500 hover:text-gray-700 underline"
                    >
                      إلغاء التحديد
                    </button>
                  </div>
                )}
              </div>

              {selectedOrders.size > 0 && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setBulkStatusModalOpen(true)}
                    disabled={isBulkLoading}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-all duration-200"
                  >
                    {isBulkLoading ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    )}
                    تغيير الحالة ({selectedOrders.size})
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Enhanced Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gradient-to-r from-gray-100 to-gray-50 border-b-2 border-gray-200">
              <tr>
                <th className="px-4 py-4 text-right text-sm font-bold text-gray-800 tracking-wider w-12">
                  <input
                    type="checkbox"
                    checked={selectedOrders.size === filteredOrders.length && filteredOrders.length > 0}
                    onChange={selectedOrders.size === filteredOrders.length ? handleDeselectAll : handleSelectAll}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                </th>
                <th className="px-6 py-4 text-right text-sm font-bold text-gray-800 tracking-wider">رقم الطلب</th>
                <th className="px-6 py-4 text-right text-sm font-bold text-gray-800 tracking-wider">العميل</th>
                <th className="px-6 py-4 text-right text-sm font-bold text-gray-800 tracking-wider">التواصل</th>
                <th className="px-6 py-4 text-right text-sm font-bold text-gray-800 tracking-wider">الموقع</th>
                <th className="px-6 py-4 text-right text-sm font-bold text-gray-800 tracking-wider">المنتج والسعر</th>
                <th className="px-6 py-4 text-right text-sm font-bold text-gray-800 tracking-wider">الحالة</th>
                <th className="px-6 py-4 text-right text-sm font-bold text-gray-800 tracking-wider">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredOrders.map((originalOrder) => {
                const order = getOrderWithUpdates(originalOrder);
                const isLoading = loadingOrders.has(order.id);
                const showSuccess = showSuccessMessage === order.id;
                
                return (
                  <React.Fragment key={order.id}>
                    <tr className={`hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 transition-all duration-200 ${isLoading ? 'opacity-75' : ''} ${expandedRow === order.id ? 'bg-blue-50' : ''} ${selectedOrders.has(order.id) ? 'bg-blue-50 border-blue-200' : ''}`}>
                      <td className="px-4 py-4">
                        <input
                          type="checkbox"
                          checked={selectedOrders.has(order.id)}
                          onChange={() => handleSelectOrder(order.id)}
                          className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col space-y-1">
                          <span className="font-bold text-lg text-gray-900">#{order.id}</span>
                          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full inline-block w-fit">صف {order.id}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col space-y-1">
                          <span className="font-bold text-gray-900 text-lg">{order.name}</span>
                          <span className="text-sm text-gray-800">{order.productName}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col space-y-3">
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => handleCopy(order.phone)}
                              className="flex items-center gap-2 px-3 py-2 bg-blue-100 hover:bg-blue-200 text-blue-800 rounded-lg transition-all duration-200 text-sm font-medium"
                              title={`اضغط لنسخ: ${formatPhoneForDisplay(order.phone)}`}
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                              </svg>
                              <span className="text-gray-900">{formatPhoneForDisplay(order.phone)}</span>
                            </button>
                          </div>
                          <div className="flex items-center gap-2">
                            {/* WhatsApp للرقم الأساسي */}
                            {order.phone && (
                              <a
                                href={`https://wa.me/${formatPhoneNumber(order.phone)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-center w-10 h-10 bg-green-100 hover:bg-green-200 text-green-600 rounded-full transition-all duration-200 shadow-sm hover:shadow-md"
                                title={`WhatsApp الرقم الأساسي: ${order.phone}`}
                              >
                                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                                </svg>
                              </a>
                            )}
                            {/* WhatsApp للرقم الثاني إذا كان مختلف */}
                            {order.whatsapp && order.whatsapp !== order.phone && (
                              <a
                                href={`https://wa.me/${formatPhoneNumber(order.whatsapp)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-center w-10 h-10 bg-green-100 hover:bg-green-200 text-green-600 rounded-full transition-all duration-200 shadow-sm hover:shadow-md"
                                title={`WhatsApp الثاني: ${order.whatsapp}`}
                              >
                                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                                </svg>
                              </a>
                            )}
                            {/* رسائل WhatsApp الجاهزة */}
                            <WhatsAppTemplates
                              customer={{
                                name: order.name,
                                productName: order.productName || 'المنتج',
                                totalPrice: order.totalPrice,
                                phone: order.phone
                              }}
                              orderStatus={order.status || 'جديد'}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col space-y-1">
                          <span className="font-medium text-gray-900">{order.governorate}</span>
                          {order.area && <span className="text-sm text-gray-800">{order.area}</span>}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col space-y-1">
                          <span className="font-medium text-gray-900">{order.productName}</span>
                          <span className="text-lg font-bold text-green-700">{order.totalPrice}</span>
                          {order.quantity && <span className="text-sm text-gray-800">الكمية: {order.quantity}</span>}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col space-y-3">
                          <StatusBadge status={order.status || 'جديد'} />
                          <select
                            value={order.status || 'جديد'}
                            onChange={(e) => handleStatusChange(order.id, e.target.value)}
                            disabled={isLoading}
                            className={`text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 transition-all ${
                              isLoading ? 'opacity-50 cursor-not-allowed' : 'hover:border-blue-400 bg-white shadow-sm'
                            }`}
                          >
                            {statuses.map(status => (
                              <option key={status} value={status}>{status}</option>
                            ))}
                          </select>
                          {isLoading && (
                            <div className="flex items-center gap-2 text-blue-600">
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                              <span className="text-xs">جاري الحفظ...</span>
                            </div>
                          )}
                          {showSuccess && (
                            <div className="text-green-600 text-sm animate-pulse flex items-center gap-1">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                              تم الحفظ
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => openEditModal(order)}
                            disabled={isLoading}
                            className="flex items-center justify-center w-10 h-10 bg-blue-100 hover:bg-blue-200 text-blue-600 rounded-full transition-all duration-200 disabled:opacity-50 shadow-sm hover:shadow-md"
                            title="تعديل التفاصيل"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => setExpandedRow(expandedRow === order.id ? null : order.id)}
                            className="flex items-center justify-center w-10 h-10 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-full transition-all duration-200 shadow-sm hover:shadow-md"
                            title="عرض التفاصيل"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={expandedRow === order.id ? "M5 15l7-7 7 7" : "M19 9l-7 7-7-7"} />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expandedRow === order.id && (
                      <tr>
                        <td colSpan={8} className="px-6 py-6 bg-gradient-to-r from-blue-50 to-indigo-50">
                          <div className="bg-white rounded-xl p-6 shadow-sm border border-blue-100">
                            <h4 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              تفاصيل الطلب #{order.id}
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                              <div className="space-y-2">
                                <span className="font-medium text-gray-700 text-sm">📞 رقم الهاتف الكامل</span>
                                <p className="text-gray-900 font-mono bg-gray-50 px-3 py-2 rounded-lg">{order.phone || '-'}</p>
                              </div>
                              <div className="space-y-2">
                                <span className="font-medium text-gray-700 text-sm">💬 رقم الواتساب</span>
                                <p className="text-gray-900 font-mono bg-gray-50 px-3 py-2 rounded-lg">{order.whatsapp || '-'}</p>
                              </div>
                              <div className="space-y-2">
                                <span className="font-medium text-gray-700 text-sm">📍 المنطقة</span>
                                <p className="text-gray-900 bg-gray-50 px-3 py-2 rounded-lg">{order.area || '-'}</p>
                              </div>
                              <div className="space-y-2">
                                <span className="font-medium text-gray-700 text-sm">🏠 العنوان</span>
                                <p className="text-gray-900 bg-gray-50 px-3 py-2 rounded-lg">{order.address || '-'}</p>
                              </div>
                              <div className="space-y-2">
                                <span className="font-medium text-gray-700 text-sm">📋 تفاصيل الطلب</span>
                                <p className="text-gray-900 bg-gray-50 px-3 py-2 rounded-lg">{order.orderDetails || '-'}</p>
                              </div>
                              <div className="space-y-2">
                                <span className="font-medium text-gray-700 text-sm">📊 الكمية</span>
                                <p className="text-gray-900 bg-gray-50 px-3 py-2 rounded-lg">{order.quantity || '-'}</p>
                              </div>
                              <div className="space-y-2">
                                <span className="font-medium text-gray-700 text-sm">🔗 المصدر</span>
                                <p className="text-gray-900 bg-gray-50 px-3 py-2 rounded-lg">{order.source || '-'}</p>
                              </div>
                              <div className="space-y-2">
                                <span className="font-medium text-gray-700 text-sm">✅ حالة إرسال الواتساب</span>
                                <p className="text-gray-900 bg-gray-50 px-3 py-2 rounded-lg">{order.whatsappSent || '-'}</p>
                              </div>
                              {order.notes && (
                                <div className="space-y-2 md:col-span-2 lg:col-span-3">
                                  <span className="font-medium text-gray-700 text-sm">📝 الملاحظات</span>
                                  <p className="text-gray-900 bg-gray-50 px-3 py-2 rounded-lg">{order.notes}</p>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Enhanced Edit Modal */}
      {editModalOpen && editingOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[95vh] overflow-y-auto">
            <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-6 rounded-t-2xl">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold flex items-center gap-3">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  تعديل تفاصيل الطلب #{editingOrder.id}
                </h3>
                <button
                  onClick={() => setEditModalOpen(false)}
                  className="text-white hover:text-gray-200 transition-colors p-2 hover:bg-white hover:bg-opacity-20 rounded-full"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-gray-700">👤 الاسم</label>
                  <input
                    type="text"
                    value={editingOrder.name}
                    onChange={(e) => handleUpdateField('name', e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 shadow-sm text-gray-900"
                  />
                </div>
                
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-gray-700">📞 رقم الهاتف</label>
                  <input
                    type="text"
                    value={editingOrder.phone}
                    onChange={(e) => handleUpdateField('phone', e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 shadow-sm font-mono text-gray-900"
                  />
                </div>
                
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-gray-700">💬 رقم الواتساب</label>
                  <input
                    type="text"
                    value={editingOrder.whatsapp}
                    onChange={(e) => handleUpdateField('whatsapp', e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 shadow-sm font-mono text-gray-900"
                  />
                </div>
                
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-gray-700">🏙️ المحافظة</label>
                  <input
                    type="text"
                    value={editingOrder.governorate}
                    onChange={(e) => handleUpdateField('governorate', e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 shadow-sm text-gray-900"
                  />
                </div>
                
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-gray-700">📍 المنطقة</label>
                  <input
                    type="text"
                    value={editingOrder.area}
                    onChange={(e) => handleUpdateField('area', e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 shadow-sm text-gray-900"
                  />
                </div>
                
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-gray-700">📦 اسم المنتج</label>
                  <input
                    type="text"
                    value={editingOrder.productName}
                    onChange={(e) => handleUpdateField('productName', e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 shadow-sm text-gray-900"
                  />
                </div>
                
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-gray-700">📊 الكمية</label>
                  <input
                    type="text"
                    value={editingOrder.quantity}
                    onChange={(e) => handleUpdateField('quantity', e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 shadow-sm text-gray-900"
                  />
                </div>
                
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-gray-700">💰 السعر الإجمالي</label>
                  <input
                    type="text"
                    value={editingOrder.totalPrice}
                    onChange={(e) => handleUpdateField('totalPrice', e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 shadow-sm text-gray-900"
                  />
                </div>
                
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-gray-700">🔗 المصدر</label>
                  <input
                    type="text"
                    value={editingOrder.source}
                    onChange={(e) => handleUpdateField('source', e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 shadow-sm text-gray-900"
                  />
                </div>
                
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-gray-700">📋 الحالة</label>
                  <select
                    value={editingOrder.status}
                    onChange={(e) => handleUpdateField('status', e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 shadow-sm text-gray-900"
                  >
                    {statuses.map(status => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </div>
                
                <div className="space-y-2 md:col-span-2">
                  <label className="block text-sm font-bold text-gray-700">🏠 العنوان الكامل</label>
                  <textarea
                    value={editingOrder.address}
                    onChange={(e) => handleUpdateField('address', e.target.value)}
                    rows={3}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 shadow-sm text-gray-900"
                  />
                </div>
                
                <div className="space-y-2 md:col-span-2">
                  <label className="block text-sm font-bold text-gray-700">📋 تفاصيل الطلب</label>
                  <textarea
                    value={editingOrder.orderDetails}
                    onChange={(e) => handleUpdateField('orderDetails', e.target.value)}
                    rows={3}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 shadow-sm text-gray-900"
                  />
                </div>
                
                <div className="space-y-2 md:col-span-2">
                  <label className="block text-sm font-bold text-gray-700">📝 الملاحظات</label>
                  <textarea
                    value={editingOrder.notes}
                    onChange={(e) => handleUpdateField('notes', e.target.value)}
                    rows={4}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 shadow-sm text-gray-900"
                  />
                </div>
              </div>
              
              <div className="flex justify-end gap-4 mt-8 pt-6 border-t border-gray-200">
                <button
                  onClick={() => setEditModalOpen(false)}
                  disabled={loadingOrders.has(editingOrder.id)}
                  className="px-6 py-3 text-gray-600 border border-gray-300 rounded-xl hover:bg-gray-50 disabled:opacity-50 transition-all duration-200 font-medium"
                >
                  إلغاء
                </button>
                <button
                  onClick={saveOrder}
                  disabled={loadingOrders.has(editingOrder.id)}
                  className="px-8 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 flex items-center gap-3 transition-all duration-200 font-bold shadow-lg"
                >
                  {loadingOrders.has(editingOrder.id) && (
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  )}
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  حفظ التغييرات
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* نافذة تغيير الحالة الجماعية */}
      {bulkStatusModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-6 rounded-t-2xl">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold flex items-center gap-3">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  تغيير الحالة الجماعية
                </h3>
                <button
                  onClick={() => setBulkStatusModalOpen(false)}
                  className="text-white hover:text-gray-200 transition-colors p-2 hover:bg-white hover:bg-opacity-20 rounded-full"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            
            <div className="p-6">
              <div className="mb-6">
                <p className="text-gray-700 mb-2">
                  سيتم تغيير حالة <span className="font-bold text-blue-600">{selectedOrders.size}</span> طلب
                </p>
                <p className="text-sm text-gray-500">
                  اختر الحالة الجديدة من القائمة أدناه
                </p>
              </div>
              
              <div className="space-y-3">
                {statuses.map(status => (
                  <button
                    key={status}
                    onClick={() => handleBulkStatusUpdate(status)}
                    className="w-full text-right px-4 py-3 border border-gray-300 rounded-lg hover:bg-blue-50 hover:border-blue-300 transition-all duration-200 flex items-center justify-between group"
                  >
                    <span className="font-medium text-gray-900">{status}</span>
                    <svg className="w-5 h-5 text-gray-400 group-hover:text-blue-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                ))}
              </div>
              
              <div className="flex justify-end gap-4 mt-6 pt-6 border-t border-gray-200">
                <button
                  onClick={() => setBulkStatusModalOpen(false)}
                  className="px-6 py-3 text-gray-600 border border-gray-300 rounded-xl hover:bg-gray-50 transition-all duration-200 font-medium"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
} 