import { useState } from 'react';

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

interface BostaExportProps {
  orders: Order[];
  selectedOrders: number[];
  onSelectOrder: (orderId: number) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onUpdateOrder: (id: number, updates: Partial<Order>) => Promise<void>;
}

export default function BostaExport({ orders, selectedOrders, onSelectOrder, onSelectAll, onDeselectAll, onUpdateOrder }: BostaExportProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [loadingOrders, setLoadingOrders] = useState<Set<number>>(new Set());
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);

  const exportableOrders = orders.filter(order => 
    order.status === 'تم التأكيد' && 
    order.name && 
    order.phone && 
    order.governorate &&
    order.address
  );

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
    setIsArchiving(true);
    try {
      await fetch('/api/orders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orders: selectedOrders, status: 'تم الشحن' }),
      });
      onDeselectAll(); // Clear selection after archiving
      onUpdateOrder(0, {}); // Trigger a re-fetch by calling parent update function
    } catch (error) {
      console.error('Failed to archive orders:', error);
      alert('فشل في أرشفة الطلبات.');
    } finally {
      setIsArchiving(false);
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
    // This mapping is now updated to match the official Bosta template columns and rules.
    return {
      // --- Customer Information ---
      'Full Name': order.name,
      'Phone': order.phone.replace(/\D/g, ''), // Clean phone number
      'Second Phone': order.whatsapp ? order.whatsapp.replace(/\D/g, '') : '',
      'City': order.governorate,
      'Area': order.area || 'منطقة أخرى', // Default value if area is missing
      'Street Name': order.address,
      'Building#, Floor#, and Apartment#': '', // Optional, leave empty
      'Work address': '', // Optional, leave empty
      'Delivery notes': order.notes || '',

      // --- Order Details ---
      'Type': 'Cash Collection', // Default type as per requirement
      'Cash Amount': order.totalPrice ? order.totalPrice.replace(/\D/g, '') : '0',
      '#Items': order.quantity || '1',
      'Package Description': order.productName || order.orderDetails || 'Order',
      'Order Reference': `SMRKT-${order.id}-${new Date().toISOString().slice(0, 10)}`, // Unique reference
      'Allow opening package': '', // Optional, leave empty

      // --- Exchange / Large Deliveries (Optional) ---
      'Return #Items': '',
      'Return Package Description': '',
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
      
      // The headers must be in the exact order as defined in the mapping function.
      const headers = Object.keys(bostaData[0]);
      const csvContent = [
        headers.join(','),
        ...bostaData.map(row => 
          headers.map(header => {
            const value = (row as any)[header] || '';
            // Escape commas and quotes in values
            return `"${String(value).replace(/"/g, '""')}"`;
          }).join(',')
        )
      ].join('\n');
      
      // Create and download file
      const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' }); // Add BOM for Excel
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `bosta-orders-${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
    } catch (error) {
      console.error('Export error:', error);
      alert('حدث خطأ أثناء التصدير');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <>
      <div className="bg-white shadow-lg rounded-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold">تصدير طلبات بوسطة</h2>
          <div className="flex gap-2">
            <button
              onClick={onSelectAll}
              className="px-4 py-2 text-sm bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200"
            >
              تحديد الكل
            </button>
            <button
              onClick={onDeselectAll}
              className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
            >
              إلغاء التحديد
            </button>
          </div>
        </div>

        <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <h3 className="font-medium text-yellow-800 mb-2">متطلبات التصدير:</h3>
          <ul className="text-sm text-yellow-700 space-y-1">
            <li>• يجب أن تكون حالة الطلب "تم التأكيد"</li>
            <li>• يجب توفر الاسم ورقم الهاتف والمحافظة والعنوان</li>
            <li>• سيتم تصدير {exportableOrders.length} طلب من أصل {orders.length}</li>
          </ul>
        </div>

        <div className="overflow-x-auto mb-6">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-right">
                  <input
                    type="checkbox"
                    checked={selectedOrders.length === exportableOrders.length && exportableOrders.length > 0}
                    onChange={selectedOrders.length === exportableOrders.length ? onDeselectAll : onSelectAll}
                    className="rounded"
                  />
                </th>
                <th className="px-3 py-2 text-right font-medium text-gray-700">#</th>
                <th className="px-3 py-2 text-right font-medium text-gray-700">الاسم</th>
                <th className="px-3 py-2 text-right font-medium text-gray-700">الهاتف</th>
                <th className="px-3 py-2 text-right font-medium text-gray-700">المحافظة</th>
                <th className="px-3 py-2 text-right font-medium text-gray-700">المنتج</th>
                <th className="px-3 py-2 text-right font-medium text-gray-700">السعر</th>
                <th className="px-3 py-2 text-right font-medium text-gray-700">الحالة</th>
                <th className="px-3 py-2 text-right font-medium text-gray-700">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {exportableOrders.map((order) => {
                const isLoading = loadingOrders.has(order.id);
                return (
                  <tr key={order.id} className={`hover:bg-gray-50 ${isLoading ? 'opacity-50' : ''}`}>
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selectedOrders.includes(order.id)}
                        onChange={() => onSelectOrder(order.id)}
                        className="rounded"
                      />
                    </td>
                    <td className="px-3 py-2">{order.id}</td>
                    <td className="px-3 py-2">{order.name}</td>
                    <td className="px-3 py-2">{order.phone}</td>
                    <td className="px-3 py-2">{order.governorate}</td>
                    <td className="px-3 py-2">{order.productName}</td>
                    <td className="px-3 py-2">{order.totalPrice}</td>
                    <td className="px-3 py-2">
                      <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">
                        {order.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 flex items-center gap-2">
                      <button
                        onClick={() => handleRevertStatus(order.id)}
                        disabled={isLoading}
                        className="text-sm text-blue-600 hover:text-blue-800 disabled:opacity-50"
                        title="إعادة الطلب إلى قائمة الطلبات النشطة"
                      >
                        {isLoading ? 'جاري...' : 'إعادة للطلبات'}
                      </button>
                      <button
                        onClick={() => openEditModal(order)}
                        className="text-gray-500 hover:text-blue-600 disabled:opacity-50"
                        title="تعديل الطلب"
                        disabled={isLoading}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-600">
            تم تحديد {selectedOrders.length} طلب للتصدير
          </div>
          <div className="flex gap-4">
            <button
              onClick={handleArchiveSelected}
              disabled={selectedOrders.length === 0 || isArchiving}
              className="px-6 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 disabled:opacity-50 flex items-center gap-2"
            >
              {isArchiving && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>}
              أرشفة ما تم تصديره (تم الشحن)
            </button>
            <button
              onClick={handleExport}
              disabled={selectedOrders.length === 0 || isExporting}
              className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isExporting && (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              )}
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              تصدير ملف بوسطة
            </button>
          </div>
        </div>
      </div>
      
      {/* Edit Modal (Full version) */}
      {editModalOpen && editingOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">تعديل تفاصيل الطلب #{editingOrder.id}</h3>
              <button onClick={() => setEditModalOpen(false)} className="text-gray-500 hover:text-gray-700">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">الاسم</label><input type="text" value={editingOrder.name} onChange={(e) => handleUpdateField('name', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">رقم الهاتف</label><input type="text" value={editingOrder.phone} onChange={(e) => handleUpdateField('phone', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">رقم الواتساب</label><input type="text" value={editingOrder.whatsapp} onChange={(e) => handleUpdateField('whatsapp', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">المحافظة</label><input type="text" value={editingOrder.governorate} onChange={(e) => handleUpdateField('governorate', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">المنطقة</label><input type="text" value={editingOrder.area} onChange={(e) => handleUpdateField('area', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">اسم المنتج</label><input type="text" value={editingOrder.productName} onChange={(e) => handleUpdateField('productName', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">الكمية</label><input type="text" value={editingOrder.quantity} onChange={(e) => handleUpdateField('quantity', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">السعر الإجمالي</label><input type="text" value={editingOrder.totalPrice} onChange={(e) => handleUpdateField('totalPrice', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">المصدر</label><input type="text" value={editingOrder.source} onChange={(e) => handleUpdateField('source', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" /></div>
              <div className="md:col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">العنوان الكامل</label><textarea value={editingOrder.address} onChange={(e) => handleUpdateField('address', e.target.value)} rows={2} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" /></div>
              <div className="md:col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">تفاصيل الطلب</label><textarea value={editingOrder.orderDetails} onChange={(e) => handleUpdateField('orderDetails', e.target.value)} rows={2} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" /></div>
              <div className="md:col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">الملاحظات</label><textarea value={editingOrder.notes} onChange={(e) => handleUpdateField('notes', e.target.value)} rows={3} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" /></div>
            </div>
            
            <div className="flex justify-end gap-4 mt-6">
              <button onClick={() => setEditModalOpen(false)} disabled={loadingOrders.has(editingOrder.id)} className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50">إلغاء</button>
              <button onClick={saveOrder} disabled={loadingOrders.has(editingOrder.id)} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
                {loadingOrders.has(editingOrder.id) && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>}
                حفظ التغييرات
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
} 