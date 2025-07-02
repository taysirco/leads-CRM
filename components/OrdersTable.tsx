import React, { useState, useMemo } from 'react';
import StatusBadge from './StatusBadge';
import WhatsAppTemplates from './WhatsAppTemplates';
import { testPhoneFormatter, formatPhoneForDisplay } from '../lib/phoneFormatter';

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
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingNotes, setEditingNotes] = useState('');
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [loadingOrders, setLoadingOrders] = useState<Set<number>>(new Set());
  const [optimisticUpdates, setOptimisticUpdates] = useState<Map<number, Partial<Order>>>(new Map());
  const [showSuccessMessage, setShowSuccessMessage] = useState<number | null>(null);
  const [copySuccess, setCopySuccess] = useState('');

  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      const matchesSearch = !searchTerm || 
        order.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.phone.includes(searchTerm) ||
        order.whatsapp.includes(searchTerm);
      
      const matchesStatus = !statusFilter || order.status === statusFilter;
      const matchesSource = !sourceFilter || order.source === sourceFilter;
      
      return matchesSearch && matchesStatus && matchesSource;
    });
  }, [orders, searchTerm, statusFilter, sourceFilter]);

  const sources = [...new Set(orders.map(o => o.source).filter(Boolean))];

  const formatPhoneNumber = (phone: string) => {
    if (!phone) return '';
    return phone.startsWith('+') ? phone.substring(1) : phone;
  };

  const getOrderWithUpdates = (order: Order) => {
    const updates = optimisticUpdates.get(order.id);
    return updates ? { ...order, ...updates } : order;
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
      {copySuccess && (
        <div className="fixed bottom-4 right-4 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg animate-bounce">
          {copySuccess}
        </div>
      )}
      <div className="bg-white shadow-lg rounded-lg overflow-hidden">
        {/* Filters */}
        <div className="p-4 bg-gray-50 border-b">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <input
                type="text"
                placeholder="بحث بالاسم أو الهاتف..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">كل الحالات</option>
                {statuses.map(status => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </div>
            <div>
              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">كل المصادر</option>
                {sources.map(source => (
                  <option key={source} value={source}>{source}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center">
              <span className="text-sm text-gray-600">
                عرض {filteredOrders.length} من {orders.length} طلب
              </span>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-100 border-b">
              <tr>
                <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">رقم</th>
                {/* <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">التاريخ</th> */}
                <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">الاسم</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">الهاتف</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">المحافظة</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">المنتج</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">السعر</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">الحالة</th>
                {/* <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">ملاحظات</th> */}
                <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredOrders.map((originalOrder) => {
                const order = getOrderWithUpdates(originalOrder);
                const isLoading = loadingOrders.has(order.id);
                const showSuccess = showSuccessMessage === order.id;
                
                return (
                  <React.Fragment key={order.id}>
                    <tr className={`hover:bg-gray-50 transition-colors ${isLoading ? 'opacity-75' : ''}`}>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex flex-col">
                          <span className="font-medium">#{order.id}</span>
                          <span className="text-xs text-gray-500">صف {order.id}</span>
                        </div>
                      </td>
                      {/* <td className="px-4 py-3 text-sm">
                        {order.orderDate ? new Date(order.orderDate).toLocaleDateString('ar-EG') : '-'}
                      </td> */}
                      <td className="px-4 py-3 font-medium">{order.name}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleCopy(order.phone)}
                            className="text-blue-600 hover:text-blue-800 flex items-center gap-1 text-sm font-mono"
                            title={`اضغط لنسخ: ${formatPhoneForDisplay(order.phone)}`}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                            </svg>
                            {formatPhoneForDisplay(order.phone)}
                          </button>
                          {/* WhatsApp للرقم الأساسي */}
                          {order.phone && (
                            <a
                              href={`https://wa.me/${formatPhoneNumber(order.phone)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-green-600 hover:text-green-800 p-1 rounded hover:bg-green-50"
                              title={`WhatsApp الرقم الأساسي: ${order.phone}`}
                            >
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                              </svg>
                            </a>
                          )}
                          {/* WhatsApp للرقم الثاني إذا كان مختلف */}
                          {order.whatsapp && order.whatsapp !== order.phone && (
                            <>
                              <span className="text-gray-300">|</span>
                              <a
                                href={`https://wa.me/${formatPhoneNumber(order.whatsapp)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-green-600 hover:text-green-800 p-1 rounded hover:bg-green-50"
                                title={`WhatsApp الثاني: ${order.whatsapp}`}
                              >
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                                </svg>
                              </a>
                              <span className="text-xs text-gray-500 font-mono" title={order.whatsapp}>
                                {formatPhoneForDisplay(order.whatsapp)}
                              </span>
                            </>
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
                      </td>
                      <td className="px-4 py-3 text-sm">{order.governorate}</td>
                      <td className="px-4 py-3 text-sm">{order.productName}</td>
                      <td className="px-4 py-3 text-sm font-medium">{order.totalPrice}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <select
                            value={order.status || 'جديد'}
                            onChange={(e) => handleStatusChange(order.id, e.target.value)}
                            disabled={isLoading}
                            className={`text-sm border border-gray-300 rounded-lg px-2 py-1 focus:ring-2 focus:ring-blue-500 transition-all ${
                              isLoading ? 'opacity-50 cursor-not-allowed' : 'hover:border-blue-400'
                            }`}
                          >
                            {statuses.map(status => (
                              <option key={status} value={status}>{status}</option>
                            ))}
                          </select>
                          {isLoading && (
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                          )}
                          {showSuccess && (
                            <div className="text-green-600 text-sm animate-pulse">
                              ✓ تم الحفظ
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <StatusBadge status={order.status || 'جديد'} />
                          <button
                            onClick={() => openEditModal(order)}
                            disabled={isLoading}
                            className="text-blue-600 hover:text-blue-800 text-sm disabled:opacity-50"
                            title="تعديل التفاصيل"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => setExpandedRow(expandedRow === order.id ? null : order.id)}
                            className="text-gray-600 hover:text-gray-800 text-sm"
                            title="عرض التفاصيل"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={expandedRow === order.id ? "M5 15l7-7 7 7" : "M19 9l-7 7-7-7"} />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expandedRow === order.id && (
                      <tr>
                        <td colSpan={10} className="px-4 py-4 bg-gray-50">
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                            <div>
                              <span className="font-medium text-gray-700">رقم الهاتف الكامل:</span>
                              <p className="text-gray-600 font-mono">{order.phone || '-'}</p>
                            </div>
                            <div>
                              <span className="font-medium text-gray-700">رقم الواتساب:</span>
                              <p className="text-gray-600 font-mono">{order.whatsapp || '-'}</p>
                            </div>
                            <div>
                              <span className="font-medium text-gray-700">المنطقة:</span>
                              <p className="text-gray-600">{order.area || '-'}</p>
                            </div>
                            <div>
                              <span className="font-medium text-gray-700">العنوان:</span>
                              <p className="text-gray-600">{order.address || '-'}</p>
                            </div>
                            <div>
                              <span className="font-medium text-gray-700">تفاصيل الطلب:</span>
                              <p className="text-gray-600">{order.orderDetails || '-'}</p>
                            </div>
                            <div>
                              <span className="font-medium text-gray-700">الكمية:</span>
                              <p className="text-gray-600">{order.quantity || '-'}</p>
                            </div>
                            <div>
                              <span className="font-medium text-gray-700">المصدر:</span>
                              <p className="text-gray-600">{order.source || '-'}</p>
                            </div>
                            <div>
                              <span className="font-medium text-gray-700">حالة إرسال الواتساب:</span>
                              <p className="text-gray-600">{order.whatsappSent || '-'}</p>
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

      {/* Edit Modal */}
      {editModalOpen && editingOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">تعديل تفاصيل الطلب #{editingOrder.id}</h3>
              <button
                onClick={() => setEditModalOpen(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">الاسم</label>
                <input
                  type="text"
                  value={editingOrder.name}
                  onChange={(e) => handleUpdateField('name', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">رقم الهاتف</label>
                <input
                  type="text"
                  value={editingOrder.phone}
                  onChange={(e) => handleUpdateField('phone', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">رقم الواتساب</label>
                <input
                  type="text"
                  value={editingOrder.whatsapp}
                  onChange={(e) => handleUpdateField('whatsapp', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">المحافظة</label>
                <input
                  type="text"
                  value={editingOrder.governorate}
                  onChange={(e) => handleUpdateField('governorate', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">المنطقة</label>
                <input
                  type="text"
                  value={editingOrder.area}
                  onChange={(e) => handleUpdateField('area', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">اسم المنتج</label>
                <input
                  type="text"
                  value={editingOrder.productName}
                  onChange={(e) => handleUpdateField('productName', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">الكمية</label>
                <input
                  type="text"
                  value={editingOrder.quantity}
                  onChange={(e) => handleUpdateField('quantity', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">السعر الإجمالي</label>
                <input
                  type="text"
                  value={editingOrder.totalPrice}
                  onChange={(e) => handleUpdateField('totalPrice', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">المصدر</label>
                <input
                  type="text"
                  value={editingOrder.source}
                  onChange={(e) => handleUpdateField('source', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">الحالة</label>
                <select
                  value={editingOrder.status}
                  onChange={(e) => handleUpdateField('status', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  {statuses.map(status => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </div>
              
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">العنوان الكامل</label>
                <textarea
                  value={editingOrder.address}
                  onChange={(e) => handleUpdateField('address', e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">تفاصيل الطلب</label>
                <textarea
                  value={editingOrder.orderDetails}
                  onChange={(e) => handleUpdateField('orderDetails', e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">الملاحظات</label>
                <textarea
                  value={editingOrder.notes}
                  onChange={(e) => handleUpdateField('notes', e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            
            <div className="flex justify-end gap-4 mt-6">
              <button
                onClick={() => setEditModalOpen(false)}
                disabled={loadingOrders.has(editingOrder.id)}
                className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                إلغاء
              </button>
              <button
                onClick={saveOrder}
                disabled={loadingOrders.has(editingOrder.id)}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                {loadingOrders.has(editingOrder.id) && (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                )}
                حفظ التغييرات
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
} 