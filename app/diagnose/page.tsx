'use client';

import { useState, useEffect } from 'react';

export default function DiagnosePage() {
  const [diagnosis, setDiagnosis] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDiagnosis();
  }, []);

  const fetchDiagnosis = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/diagnose-phones');
      const data = await response.json();
      
      if (data.success) {
        setDiagnosis(data);
        setError(null);
      } else {
        setError(data.error || 'حدث خطأ في التشخيص');
      }
    } catch (err) {
      setError('فشل في الاتصال بالخادم');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">جاري تشخيص البيانات...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center bg-white p-8 rounded-lg shadow-lg">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-4">خطأ في التشخيص</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={fetchDiagnosis}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700"
          >
            إعادة المحاولة
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-800 mb-8">
          تشخيص أرقام الهاتف والواتساب
        </h1>

        {/* ملخص عام */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white p-6 rounded-lg shadow-lg">
            <h3 className="text-lg font-semibold text-gray-700 mb-2">إجمالي الصفوف</h3>
            <p className="text-3xl font-bold text-blue-600">{diagnosis?.summary?.totalRows || 0}</p>
          </div>
          
          <div className="bg-white p-6 rounded-lg shadow-lg">
            <h3 className="text-lg font-semibold text-gray-700 mb-2">عمود الهاتف</h3>
            <p className="text-xl font-bold text-green-600">{diagnosis?.summary?.phoneColumn}</p>
          </div>
          
          <div className="bg-white p-6 rounded-lg shadow-lg">
            <h3 className="text-lg font-semibold text-gray-700 mb-2">عمود الواتساب</h3>
            <p className="text-xl font-bold text-green-600">{diagnosis?.summary?.whatsappColumn}</p>
          </div>
          
          <div className="bg-white p-6 rounded-lg shadow-lg">
            <h3 className="text-lg font-semibold text-gray-700 mb-2">إجمالي الأخطاء</h3>
            <p className="text-3xl font-bold text-red-600">{diagnosis?.summary?.totalErrors || 0}</p>
          </div>
        </div>

        {/* إحصائيات الهاتف */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          <div className="bg-white p-6 rounded-lg shadow-lg">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">📞 إحصائيات رقم الهاتف</h2>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span>إجمالي الأرقام:</span>
                <span className="font-bold">{diagnosis?.phoneStats?.total || 0}</span>
              </div>
              <div className="flex justify-between">
                <span>أرقام صحيحة:</span>
                <span className="font-bold text-green-600">{diagnosis?.phoneStats?.valid || 0}</span>
              </div>
              <div className="flex justify-between">
                <span>خلايا فارغة:</span>
                <span className="font-bold text-gray-500">{diagnosis?.phoneStats?.empty || 0}</span>
              </div>
              <div className="flex justify-between">
                <span>أخطاء #ERROR!:</span>
                <span className="font-bold text-red-600">{diagnosis?.phoneStats?.hasError || 0}</span>
              </div>
              <div className="flex justify-between">
                <span>تحتاج مراجعة:</span>
                <span className="font-bold text-yellow-600">{diagnosis?.phoneStats?.problematic || 0}</span>
              </div>
            </div>
          </div>

          {/* إحصائيات الواتساب */}
          <div className="bg-white p-6 rounded-lg shadow-lg">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">💬 إحصائيات رقم الواتساب</h2>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span>إجمالي الأرقام:</span>
                <span className="font-bold">{diagnosis?.whatsappStats?.total || 0}</span>
              </div>
              <div className="flex justify-between">
                <span>أرقام صحيحة:</span>
                <span className="font-bold text-green-600">{diagnosis?.whatsappStats?.valid || 0}</span>
              </div>
              <div className="flex justify-between">
                <span>خلايا فارغة:</span>
                <span className="font-bold text-gray-500">{diagnosis?.whatsappStats?.empty || 0}</span>
              </div>
              <div className="flex justify-between">
                <span>أخطاء #ERROR!:</span>
                <span className="font-bold text-red-600">{diagnosis?.whatsappStats?.hasError || 0}</span>
              </div>
              <div className="flex justify-between">
                <span>تحتاج مراجعة:</span>
                <span className="font-bold text-yellow-600">{diagnosis?.whatsappStats?.problematic || 0}</span>
              </div>
            </div>
          </div>
        </div>

        {/* التوصيات */}
        {diagnosis?.recommendations && diagnosis.recommendations.length > 0 && (
          <div className="bg-white p-6 rounded-lg shadow-lg mb-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">💡 التوصيات</h2>
            <ul className="space-y-2">
              {diagnosis.recommendations.map((recommendation: string, index: number) => (
                <li key={index} className="flex items-start gap-2">
                  <span className="text-blue-600 font-bold">•</span>
                  <span>{recommendation}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* تفاصيل الأخطاء */}
        {diagnosis?.errors && diagnosis.errors.length > 0 && (
          <div className="bg-white p-6 rounded-lg shadow-lg mb-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">🚨 تفاصيل الأخطاء</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full table-auto">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-4 py-2 text-right">الصف</th>
                    <th className="px-4 py-2 text-right">العمود</th>
                    <th className="px-4 py-2 text-right">القيمة الحالية</th>
                    <th className="px-4 py-2 text-right">الاقتراح</th>
                  </tr>
                </thead>
                <tbody>
                  {diagnosis.errors.map((error: any, index: number) => (
                    <tr key={index} className={index % 2 === 0 ? 'bg-gray-50' : ''}>
                      <td className="px-4 py-2 font-mono">{error.row}</td>
                      <td className="px-4 py-2">{error.column}</td>
                      <td className="px-4 py-2 font-mono text-red-600">{error.formattedValue}</td>
                      <td className="px-4 py-2 font-mono text-green-600">{error.suggestion || 'لا يوجد اقتراح'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* أرقام تحتاج مراجعة */}
        {(diagnosis?.phoneStats?.problematicDetails?.length > 0 || diagnosis?.whatsappStats?.problematicDetails?.length > 0) && (
          <div className="bg-white p-6 rounded-lg shadow-lg">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">⚠️ أرقام تحتاج مراجعة</h2>
            
            {diagnosis?.phoneStats?.problematicDetails?.length > 0 && (
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-700 mb-2">أرقام الهاتف:</h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full table-auto text-sm">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="px-3 py-2 text-right">الصف</th>
                        <th className="px-3 py-2 text-right">القيمة المنسقة</th>
                        <th className="px-3 py-2 text-right">القيمة الخام</th>
                        <th className="px-3 py-2 text-right">المشكلة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {diagnosis.phoneStats.problematicDetails.map((item: any, index: number) => (
                        <tr key={index} className={index % 2 === 0 ? 'bg-gray-50' : ''}>
                          <td className="px-3 py-2 font-mono">{item.row}</td>
                          <td className="px-3 py-2 font-mono">{item.formatted}</td>
                          <td className="px-3 py-2 font-mono">{item.unformatted}</td>
                          <td className="px-3 py-2 text-yellow-600">{item.issue || item.suggestion}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {diagnosis?.whatsappStats?.problematicDetails?.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-gray-700 mb-2">أرقام الواتساب:</h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full table-auto text-sm">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="px-3 py-2 text-right">الصف</th>
                        <th className="px-3 py-2 text-right">القيمة المنسقة</th>
                        <th className="px-3 py-2 text-right">القيمة الخام</th>
                        <th className="px-3 py-2 text-right">المشكلة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {diagnosis.whatsappStats.problematicDetails.map((item: any, index: number) => (
                        <tr key={index} className={index % 2 === 0 ? 'bg-gray-50' : ''}>
                          <td className="px-3 py-2 font-mono">{item.row}</td>
                          <td className="px-3 py-2 font-mono">{item.formatted}</td>
                          <td className="px-3 py-2 font-mono">{item.unformatted}</td>
                          <td className="px-3 py-2 text-yellow-600">{item.issue || item.suggestion}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="mt-8 text-center">
          <button
            onClick={fetchDiagnosis}
            className="bg-blue-600 text-white px-8 py-3 rounded-lg hover:bg-blue-700 font-semibold"
          >
            🔄 إعادة تشخيص البيانات
          </button>
        </div>
      </div>
    </div>
  );
} 