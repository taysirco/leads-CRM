import React, { useState } from 'react';

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

interface AddProductModalProps {
    onClose: () => void;
    onSubmit: (formData: {
        productName: string;
        initialQuantity: string;
        synonyms: string;
        minThreshold: string;
    }) => void;
    isLoading: boolean;
}

/**
 * نافذة إضافة منتج جديد
 */
function AddProductModal({ onClose, onSubmit, isLoading }: AddProductModalProps) {
    const [formData, setFormData] = useState({
        productName: '',
        initialQuantity: '',
        synonyms: '',
        minThreshold: '10'
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit(formData);
    };

    return (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full flex items-center justify-center z-50 p-4">
            <div className="relative p-4 sm:p-8 bg-white w-full max-w-md mx-auto rounded-lg shadow-lg">
                <div className="flex justify-between items-center mb-4 sm:mb-6">
                    <h3 className="text-lg sm:text-xl font-bold text-gray-900">إضافة منتج جديد</h3>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 text-xl sm:text-2xl font-bold"
                    >
                        ×
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">اسم المنتج</label>
                        <input
                            type="text"
                            value={formData.productName}
                            onChange={(e) => setFormData({ ...formData, productName: e.target.value })}
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
                                onChange={(e) => setFormData({ ...formData, initialQuantity: e.target.value })}
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
                                onChange={(e) => setFormData({ ...formData, minThreshold: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-500"
                                min="0"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">المترادفات</label>
                        <input
                            type="text"
                            value={formData.synonyms}
                            onChange={(e) => setFormData({ ...formData, synonyms: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-500"
                            placeholder="مثال: جوال، هاتف، موبايل"
                        />
                    </div>

                    <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium order-2 sm:order-1"
                        >
                            إلغاء
                        </button>
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 font-medium order-1 sm:order-2"
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

export default AddProductModal;
export type { StockItem, AddProductModalProps };
