import { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { cleanText, getUniqueProducts } from '../lib/textCleaner';
import { formatToLocalEgyptianNumber, normalizeGovernorateName } from '../lib/bosta';
import StatusBadge from './StatusBadge';

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
  bostaTrackingNumber?: string;
  bostaState?: string;
  lastBostaUpdate?: string;
}

interface BostaExportProps {
  orders: Order[];
  selectedOrders: number[];
  onSelectOrder: (orderId: number) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onUpdateOrder: (id: number, updates: Partial<Order>) => Promise<void>;
  onArchiveStart?: () => void;
  onArchiveEnd?: () => void;
}

export default function BostaExport({ orders, selectedOrders, onSelectOrder, onSelectAll, onDeselectAll, onUpdateOrder, onArchiveStart, onArchiveEnd }: BostaExportProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [isShippingViaBosta, setIsShippingViaBosta] = useState(false);
  const [bostaShipResults, setBostaShipResults] = useState<Array<{orderId: number; success: boolean; trackingNumber?: string; error?: string}>>([]);
  const [loadingOrders, setLoadingOrders] = useState<Set<number>>(new Set());
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [productFilter, setProductFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [fulfillmentType, setFulfillmentType] = useState<10 | 25 | 30>(10); // 10 = عادي, 25 = تبديل, 30 = مخزون بوسطة

  // Filter orders based on search and filters
  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      const matchesSearch = !searchTerm || 
        String(order.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(order.phone || '').includes(searchTerm);
      
      const matchesProduct = !productFilter || cleanText(order.productName) === productFilter;
      const matchesSource = !sourceFilter || order.source === sourceFilter;
      
      return matchesSearch && matchesProduct && matchesSource;
    });
  }, [orders, searchTerm, productFilter, sourceFilter]);

  // استخدام الدالة المشتركة لإنشاء قائمة منتجات ومصادر نظيفة ومرتبة
  const products = useMemo(() => {
    return getUniqueProducts(orders);
  }, [orders]);
  
  const sources = [...new Set(orders.map(o => o.source).filter(Boolean))];

  const handleRevertStatus = async (orderId: number) => {
    setLoadingOrders(prev => new Set(prev.add(orderId)));
    try {
      await onUpdateOrder(orderId, { status: 'جديد' });
      // The parent component will handle the re-fetch, and this order will disappear.
    } catch (error) {
      console.error(`Failed to revert order ${orderId}:`, error);
      alert(`فشل في إعادة الطلب #${orderId}.`);
    } finally {
      setLoadingOrders(prev => {
        const newSet = new Set(prev);
        newSet.delete(orderId);
        return newSet;
      });
    }
  };

  const handleArchiveSelected = async () => {
    if (selectedOrders.length === 0) {
      alert('يرجى تحديد الطلبات التي تم تصديرها لأرشفتها.');
      return;
    }
    
    const confirmArchive = confirm(
      `هل أنت متأكد من أرشفة ${selectedOrders.length} طلب(ات)؟\n\n` +
      `هذا سيؤدي إلى تغيير حالة الطلبات إلى "تم الشحن" وإزالتها من القائمة الرئيسية.`
    );

    if (!confirmArchive) {
      return;
    }

    // ✨ إيقاف التحديث التلقائي أثناء الأرشفة
    onArchiveStart?.();
    setIsArchiving(true);
    
    try {
      console.log(`🚀 [ARCHIVE] بدء أرشفة ${selectedOrders.length} طلب...`);
      console.log('⏸️ [ARCHIVE] تم إيقاف التحديث التلقائي مؤقتاً');
      
      const response = await fetch("/api/orders", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orders: selectedOrders, status: "تم الشحن" }),
      });
      
      const result = await response.json();
      console.log("📋 [ARCHIVE] نتيجة الأرشفة:", result);
      
      if (!response.ok) {
        if (result.stockError && result.failedOrders) {
          const successCount = selectedOrders.length - result.failedOrders.length;
          let errorMessage = `❌ فشل في أرشفة ${result.failedOrders.length} من ${selectedOrders.length} طلب بسبب نقص المخزون:\n\n`;
          
          if (result.stockResults) {
            result.stockResults
              .filter((r: any) => !r.success)
              .forEach((r: any) => {
                errorMessage += `• الطلب ${r.orderId}: ${r.message}\n`;
                if (r.availableQuantity !== undefined) {
                  errorMessage += `  المتوفر: ${r.availableQuantity} | المطلوب: ${r.quantity}\n`;
                }
              });
          }
          
          if (successCount > 0) {
            errorMessage += `\n✅ تم أرشفة ${successCount} طلب بنجاح`;
          }
          
          alert(errorMessage);
          
          onDeselectAll();
          // ✨ إعادة تفعيل التحديث التلقائي ثم إعادة تحميل الصفحة
          onArchiveEnd?.();
          window.location.reload();
          
          return;
        } else {
          throw new Error(result.message || "فشل في الأرشفة");
        }
      }
      
      console.log("✅ [ARCHIVE] تمت الأرشفة بنجاح");
      
      let successMessage = `✅ تم تحويل ${selectedOrders.length} طلب إلى حالة "تم الشحن" بنجاح!`;
      
      if (result.stockResults && result.stockResults.length > 0) {
        const totalDeducted = result.stockResults.reduce((sum: number, r: any) => sum + (r.quantity || 0), 0);
        successMessage += `\n📦 تم خصم إجمالي ${totalDeducted} قطعة من المخزون`;
      }
      
      alert(successMessage);
      
      onDeselectAll();
      // ✨ إعادة تفعيل التحديث التلقائي ثم إعادة تحميل الصفحة
      onArchiveEnd?.();
      window.location.reload();
      
      console.log("🔄 [ARCHIVE] تم تحديث البيانات بعد الأرشفة");
      
    } catch (error) {
      console.error("❌ [ARCHIVE] خطأ في الأرشفة:", error);
      alert(`فشل في أرشفة الطلبات: ${error instanceof Error ? error.message : "خطأ غير معروف"}\n\nيرجى المحاولة مرة أخرى.`);
    } finally {
      setIsArchiving(false);
      // ✨ التأكد من إعادة تفعيل التحديث التلقائي
      onArchiveEnd?.();
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
    } catch (error) {
      alert('فشل في حفظ التغييرات.');
    } finally {
      setLoadingOrders(prev => {
        const newSet = new Set(prev);
        newSet.delete(editingOrder.id);
        return newSet;
      });
    }
  };

  const mapOrderToBosta = (order: Order) => {
    // ✅ يستخدم الدوال المشتركة من bosta.ts (DRY — مصدر واحد للحقيقة)
    const isExchange = /تبديل|استبدال|exchange/i.test(order.status || '');
    return {
      'Full Name': order.name,
      'Phone': formatToLocalEgyptianNumber(order.phone),
      'Second Phone': order.whatsapp ? formatToLocalEgyptianNumber(order.whatsapp) : '',
      'City': normalizeGovernorateName(order.governorate),
      'Area': order.area || 'منطقة أخرى',
      'Street Name': order.address,
      'Building#, Floor#, and Apartment#': '',
      'Work address': '',
      'Delivery notes': order.notes || '',

      // --- Order Details ---
      'Type': isExchange ? 'Exchange' : 'Cash Collection',
      'Cash Amount': order.totalPrice ? String(order.totalPrice).replace(/\D/g, '') || '0' : '0',
      '#Items': order.quantity || '1',
      'Package Description': order.productName || order.orderDetails || 'Order',
      'Order Reference': `SMRKT-${order.id}-${new Date().toISOString().slice(0, 10)}`,
      'Allow opening package': 'yes',

      // --- Exchange / Large Deliveries (Optional) ---
      'Return #Items': isExchange ? (order.quantity || '1') : '',
      'Return Package Description': isExchange ? (order.productName || order.orderDetails || 'Return') : '',
      'Package Type': '',
    };
  };

  const handleExport = () => {
    setIsExporting(true);
    
    try {
      const selectedOrdersData = orders.filter(order => selectedOrders.includes(order.id));
      if (selectedOrdersData.length === 0) {
        alert('يرجى تحديد طلب واحد على الأقل للتصدير.');
        setIsExporting(false);
        return;
      }
      
      const bostaData = selectedOrdersData.map(mapOrderToBosta);
      
      // Create a new workbook and a worksheet, forcing phone columns to be text
      const ws = XLSX.utils.json_to_sheet(bostaData);
      
      // Manually set the type for phone number columns to Text ('s')
      const range = XLSX.utils.decode_range(ws['!ref'] as string);
      for (let R = range.s.r + 1; R <= range.e.r; ++R) { // Start from row 2 (skip header)
        const phoneCellAddress = XLSX.utils.encode_cell({c: 1, r: R}); // Column B
        const secondPhoneCellAddress = XLSX.utils.encode_cell({c: 2, r: R}); // Column C
        
        if(ws[phoneCellAddress]) ws[phoneCellAddress].t = 's';
        if(ws[secondPhoneCellAddress]) ws[secondPhoneCellAddress].t = 's';
      }

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Bosta Orders");

      // Generate the .xlsx file and trigger a download
      const fileName = `bosta-orders-${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(wb, fileName);
      
    } catch (error) {
      console.error('Export error:', error);
      alert('حدث خطأ أثناء التصدير');
    } finally {
      setIsExporting(false);
    }
  };

  // إنشاء شحنات مباشرة عبر Bosta API
  const handleBostaApiShip = async () => {
    if (selectedOrders.length === 0) {
      alert('يرجى تحديد طلب واحد على الأقل لإنشاء شحنة.');
      return;
    }

    const shipMode = fulfillmentType === 30 ? '🏭 مخزون بوسطة (Fulfillment)' : fulfillmentType === 25 ? '🔄 تبديل (Exchange)' : '🏠 مخزونك الشخصي';
    const confirmShip = confirm(
      `هل أنت متأكد من إنشاء ${selectedOrders.length} شحنة على بوسطة؟\n\n` +
      `📦 نوع الشحن: ${shipMode}\n\n` +
      `سيتم:\n• إرسال البيانات مباشرة إلى بوسطة\n• تغيير حالة الطلبات إلى "تم الشحن"\n• حفظ أرقام التتبع تلقائياً`
    );

    if (!confirmShip) return;

    setIsShippingViaBosta(true);
    setBostaShipResults([]);
    onArchiveStart?.();

    try {
      const response = await fetch('/api/bosta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderIds: selectedOrders, fulfillmentType }),
      });

      const result = await response.json();

      if (result.results) {
        setBostaShipResults(result.results);
      }

      const successCount = result.summary?.success || 0;
      const failedCount = result.summary?.failed || 0;

      let message = '';
      if (successCount > 0) {
        message += `✅ تم إنشاء ${successCount} شحنة بنجاح على بوسطة\n`;
        const successResults = (result.results || []).filter((r: any) => r.success);
        successResults.forEach((r: any) => {
          message += `  📦 طلب #${r.orderId} → تتبع: ${r.trackingNumber}\n`;
        });
      }
      if (failedCount > 0) {
        message += `\n❌ فشل في إنشاء ${failedCount} شحنة:\n`;
        const failedResults = (result.results || []).filter((r: any) => !r.success);
        failedResults.forEach((r: any) => {
          message += `  • طلب #${r.orderId}: ${r.error}\n`;
        });
      }

      alert(message);

      if (successCount > 0) {
        onDeselectAll();
        onArchiveEnd?.();
        // إعادة جلب البيانات لعرض التحديثات
        await onUpdateOrder(0, {});
      }
    } catch (error: any) {
      alert(`❌ خطأ في الاتصال بسيرفر بوسطة: ${error.message}`);
    } finally {
      setIsShippingViaBosta(false);
      onArchiveEnd?.();
    }
  };

  return (
    <>
      <div className="bg-white shadow-lg rounded-lg p-3 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 sm:mb-6 space-y-3 sm:space-y-0">
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900">تصدير طلبات بوسطة</h2>
          <div className="flex gap-2">
            <button
              onClick={onSelectAll}
              className="px-3 sm:px-4 py-2 text-xs sm:text-sm bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200"
            >
              تحديد الكل
            </button>
            <button
              onClick={onDeselectAll}
              className="px-3 sm:px-4 py-2 text-xs sm:text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
            >
              إلغاء التحديد
            </button>
          </div>
        </div>

        {/* Filters Section */}
        <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-gray-50 border border-gray-200 rounded-lg">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">البحث</label>
              <input
                type="text"
                placeholder="بحث بالاسم أو الهاتف..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">المنتج</label>
              <select
                value={productFilter}
                onChange={(e) => setProductFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white text-sm"
              >
                <option value="" className="text-gray-900 bg-white">كل المنتجات</option>
                {products.map(product => (
                  <option key={product} value={product} className="text-gray-900 bg-white">{product}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">المصدر</label>
              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white text-sm"
              >
                <option value="" className="text-gray-900 bg-white">كل المصادر</option>
                {sources.map(source => (
                  <option key={source} value={source} className="text-gray-900 bg-white">{source}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* خيار نوع الشحن */}
        <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-purple-50 border border-purple-200 rounded-lg">
          <label className="block text-xs sm:text-sm font-semibold text-purple-800 mb-2">📦 نوع الشحن عبر Bosta API</label>
          <div className="flex flex-col sm:flex-row gap-3">
            <label className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 cursor-pointer transition-all text-sm ${
              fulfillmentType === 10 
                ? 'border-purple-500 bg-purple-100 text-purple-800 shadow-sm' 
                : 'border-gray-300 bg-white text-gray-600 hover:border-purple-300'
            }`}>
              <input type="radio" name="fulfillmentType" value={10} checked={fulfillmentType === 10}
                onChange={() => setFulfillmentType(10)} className="accent-purple-600" />
              <span className="font-medium">🏠 شحن من مخزوني</span>
              <span className="text-xs text-gray-500">(بوسطة تستلم منك)</span>
            </label>
            <label className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 cursor-pointer transition-all text-sm ${
              fulfillmentType === 25 
                ? 'border-orange-500 bg-orange-100 text-orange-800 shadow-sm' 
                : 'border-gray-300 bg-white text-gray-600 hover:border-orange-300'
            }`}>
              <input type="radio" name="fulfillmentType" value={25} checked={fulfillmentType === 25}
                onChange={() => setFulfillmentType(25)} className="accent-orange-600" />
              <span className="font-medium">🔄 تبديل (Exchange)</span>
              <span className="text-xs text-gray-500">(إرسال + استلام)</span>
            </label>
            <label className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 cursor-pointer transition-all text-sm ${
              fulfillmentType === 30 
                ? 'border-purple-500 bg-purple-100 text-purple-800 shadow-sm' 
                : 'border-gray-300 bg-white text-gray-600 hover:border-purple-300'
            }`}>
              <input type="radio" name="fulfillmentType" value={30} checked={fulfillmentType === 30}
                onChange={() => setFulfillmentType(30)} className="accent-purple-600" />
              <span className="font-medium">🏭 شحن من مخزون بوسطة</span>
              <span className="text-xs text-gray-500">(Fulfillment)</span>
            </label>
          </div>
        </div>

        <div className="overflow-x-auto mb-4 sm:mb-6">
          <table className="w-full text-xs sm:text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-2 sm:px-3 py-2 text-right">
                  <input
                    type="checkbox"
                    checked={selectedOrders.length === filteredOrders.length && filteredOrders.length > 0}
                    onChange={selectedOrders.length === filteredOrders.length ? onDeselectAll : onSelectAll}
                    className="rounded w-3 h-3 sm:w-4 sm:h-4"
                  />
                </th>
                <th className="px-2 sm:px-3 py-2 text-right font-medium text-gray-700">#</th>
                <th className="px-2 sm:px-3 py-2 text-right font-medium text-gray-700">الاسم</th>
                <th className="px-2 sm:px-3 py-2 text-right font-medium text-gray-700 hidden sm:table-cell">الهاتف</th>
                <th className="px-2 sm:px-3 py-2 text-right font-medium text-gray-700 hidden md:table-cell">واتساب</th>
                <th className="px-2 sm:px-3 py-2 text-right font-medium text-gray-700 hidden lg:table-cell">المحافظة</th>
                <th className="px-2 sm:px-3 py-2 text-right font-medium text-gray-700 hidden xl:table-cell">العنوان</th>
                <th className="px-2 sm:px-3 py-2 text-right font-medium text-gray-700 hidden sm:table-cell">المنتج</th>
                <th className="px-2 sm:px-3 py-2 text-right font-medium text-gray-700">السعر</th>
                <th className="px-2 sm:px-3 py-2 text-right font-medium text-gray-700 hidden sm:table-cell">الحالة</th>
                <th className="px-2 sm:px-3 py-2 text-right font-medium text-gray-700">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredOrders.map((order) => {
                const isLoading = loadingOrders.has(order.id);
                return (
                  <tr key={order.id} className={`hover:bg-gray-50 ${isLoading ? 'opacity-70' : ''}`}>
                    <td className="px-2 sm:px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selectedOrders.includes(order.id)}
                        onChange={() => onSelectOrder(order.id)}
                        className="rounded w-3 h-3 sm:w-4 sm:h-4"
                        title={'تحديد الطلب'}
                      />
                    </td>
                    <td className="px-2 sm:px-3 py-2 text-gray-800 font-medium">{order.id}</td>
                    <td className="px-2 sm:px-3 py-2">
                      <div className="flex flex-col">
                        <span className="text-gray-900 font-medium text-xs sm:text-sm">{order.name}</span>
                        {/* عرض معلومات إضافية للهواتف المحمولة */}
                        <div className="sm:hidden text-xs text-gray-600 space-y-1 mt-1">
                          <div>📞 {order.phone}</div>
                          <div>📍 {order.governorate}</div>
                          <div>📦 {order.productName}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-2 sm:px-3 py-2 text-gray-800 font-mono hidden sm:table-cell">{order.phone}</td>
                    <td className="px-2 sm:px-3 py-2 text-gray-800 font-mono hidden md:table-cell">{order.whatsapp || '-'}</td>
                    <td className="px-2 sm:px-3 py-2 text-gray-800 hidden lg:table-cell">{order.governorate}</td>
                    <td className="px-2 sm:px-3 py-2 text-gray-700 max-w-xs truncate hidden xl:table-cell" title={order.address}>{order.address}</td>
                    <td className="px-2 sm:px-3 py-2 text-gray-800 hidden sm:table-cell">{order.productName}</td>
                    <td className="px-2 sm:px-3 py-2 text-gray-900 font-semibold">{order.totalPrice}</td>
                    <td className="px-2 sm:px-3 py-2 hidden sm:table-cell">
                      <StatusBadge status={order.status} />
                    </td>
                    <td className="px-2 sm:px-3 py-2">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-1 sm:gap-2">
                        <button
                          onClick={() => handleRevertStatus(order.id)}
                          disabled={isLoading}
                          className="text-xs text-blue-700 hover:text-blue-900 disabled:opacity-50 px-2 py-1 rounded bg-blue-50 hover:bg-blue-100"
                          title="إعادة الطلب إلى قائمة الطلبات النشطة"
                        >
                          {isLoading ? '...' : 'إعادة'}
                        </button>
                        <button
                          onClick={() => openEditModal(order)}
                          className="text-gray-600 hover:text-blue-700 disabled:opacity-50 p-1"
                          title="تعديل الطلب"
                          disabled={isLoading}
                        >
                          <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center sm:justify-between space-y-3 sm:space-y-0">
          <div className="text-xs sm:text-sm text-gray-600">
            تم تحديد {selectedOrders.length} طلب للتصدير
          </div>
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 w-full sm:w-auto">
            <button
              onClick={handleArchiveSelected}
              disabled={selectedOrders.length === 0 || isArchiving || isShippingViaBosta}
              className="px-4 sm:px-6 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 disabled:opacity-50 flex items-center justify-center gap-2 text-sm order-3 sm:order-1"
            >
              {isArchiving && <div className="animate-spin rounded-full h-3 w-3 sm:h-4 sm:w-4 border-b-2 border-white"></div>}
              <span className="hidden sm:inline">أرشفة ما تم تصديره (تم الشحن)</span>
              <span className="sm:hidden">أرشفة المحدد</span>
            </button>
            <button
              onClick={handleExport}
              disabled={selectedOrders.length === 0 || isExporting || isShippingViaBosta}
              className="px-4 sm:px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm order-2 sm:order-2"
            >
              {isExporting && (
                <div className="animate-spin rounded-full h-3 w-3 sm:h-4 sm:w-4 border-b-2 border-white"></div>
              )}
              <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="hidden sm:inline">تصدير ملف بوسطة</span>
              <span className="sm:hidden">تصدير Excel</span>
            </button>
            <button
              onClick={handleBostaApiShip}
              disabled={selectedOrders.length === 0 || isShippingViaBosta || isArchiving}
              className="px-4 sm:px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm order-1 sm:order-3 font-semibold shadow-md"
              title="إنشاء شحنة مباشرة عبر Bosta API — يتم إرسال البيانات تلقائياً وحفظ أرقام التتبع"
            >
              {isShippingViaBosta && (
                <div className="animate-spin rounded-full h-3 w-3 sm:h-4 sm:w-4 border-b-2 border-white"></div>
              )}
              <span>🚀</span>
              <span className="hidden sm:inline">إنشاء شحنة مباشرة (Bosta API)</span>
              <span className="sm:hidden">شحن مباشر</span>
            </button>
          </div>
        </div>
      </div>
      
      {/* Edit Modal (Full version) */}
      {editModalOpen && editingOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
          <div className="bg-white rounded-lg p-3 sm:p-6 w-full max-w-xs sm:max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-3 sm:mb-4">
              <h3 className="text-base sm:text-lg font-semibold">تعديل تفاصيل الطلب #{editingOrder.id}</h3>
              <button onClick={() => setEditModalOpen(false)} className="text-gray-500 hover:text-gray-700">
                <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
              <div><label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">الاسم</label><input type="text" value={editingOrder.name} onChange={(e) => handleUpdateField('name', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 text-sm" /></div>
              <div><label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">رقم الهاتف</label><input type="text" value={editingOrder.phone} onChange={(e) => handleUpdateField('phone', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 text-sm" /></div>
              <div><label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">رقم الواتساب</label><input type="text" value={editingOrder.whatsapp} onChange={(e) => handleUpdateField('whatsapp', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 text-sm" /></div>
              <div><label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">المحافظة</label><input type="text" value={editingOrder.governorate} onChange={(e) => handleUpdateField('governorate', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 text-sm" /></div>
              <div><label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">المنطقة</label><input type="text" value={editingOrder.area} onChange={(e) => handleUpdateField('area', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 text-sm" /></div>
              <div><label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">اسم المنتج</label><input type="text" value={editingOrder.productName} onChange={(e) => handleUpdateField('productName', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 text-sm" /></div>
              <div><label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">الكمية</label><input type="text" value={editingOrder.quantity} onChange={(e) => handleUpdateField('quantity', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 text-sm" /></div>
              <div><label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">السعر الإجمالي</label><input type="text" value={editingOrder.totalPrice} onChange={(e) => handleUpdateField('totalPrice', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 text-sm" /></div>
              <div><label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">المصدر</label><input type="text" value={editingOrder.source} onChange={(e) => handleUpdateField('source', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 text-sm" /></div>
              <div className="md:col-span-2"><label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">العنوان الكامل</label><textarea value={editingOrder.address} onChange={(e) => handleUpdateField('address', e.target.value)} rows={2} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 text-sm" /></div>
              <div className="md:col-span-2"><label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">تفاصيل الطلب</label><textarea value={editingOrder.orderDetails} onChange={(e) => handleUpdateField('orderDetails', e.target.value)} rows={2} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 text-sm" /></div>
              <div className="md:col-span-2"><label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">الملاحظات</label><textarea value={editingOrder.notes} onChange={(e) => handleUpdateField('notes', e.target.value)} rows={3} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 text-sm" /></div>
            </div>
            
            <div className="flex flex-col sm:flex-row justify-end gap-3 sm:gap-4 mt-4 sm:mt-6">
              <button onClick={() => setEditModalOpen(false)} disabled={loadingOrders.has(editingOrder.id)} className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 order-2 sm:order-1 text-sm">إلغاء</button>
              <button onClick={saveOrder} disabled={loadingOrders.has(editingOrder.id)} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 order-1 sm:order-2 text-sm">
                {loadingOrders.has(editingOrder.id) && <div className="animate-spin rounded-full h-3 w-3 sm:h-4 sm:w-4 border-b-2 border-white"></div>}
                حفظ التغييرات
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
} 