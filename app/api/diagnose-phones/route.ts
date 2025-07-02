import { NextResponse } from 'next/server';
import { diagnosePhoneErrors } from '../../../lib/googleSheets';

export async function GET() {
  try {
    const diagnosis = await diagnosePhoneErrors();
    
    return NextResponse.json({
      success: true,
      summary: diagnosis.summary || {},
      phoneStats: {
        total: (diagnosis.phoneStats as any)?.total || 0,
        valid: (diagnosis.phoneStats as any)?.valid || 0,
        empty: (diagnosis.phoneStats as any)?.empty || 0,
        hasError: (diagnosis.phoneStats as any)?.hasError || 0,
        problematic: (diagnosis.phoneStats as any)?.problematic?.length || 0,
        problematicDetails: (diagnosis.phoneStats as any)?.problematic || []
      },
      whatsappStats: {
        total: (diagnosis.whatsappStats as any)?.total || 0,
        valid: (diagnosis.whatsappStats as any)?.valid || 0,
        empty: (diagnosis.whatsappStats as any)?.empty || 0,
        hasError: (diagnosis.whatsappStats as any)?.hasError || 0,
        problematic: (diagnosis.whatsappStats as any)?.problematic?.length || 0,
        problematicDetails: (diagnosis.whatsappStats as any)?.problematic || []
      },
      errors: diagnosis.errors || [],
      message: (diagnosis.errors?.length || 0) > 0 
        ? `تم العثور على ${diagnosis.errors?.length || 0} خطأ في أرقام الهاتف والواتساب`
        : 'لا توجد أخطاء في أرقام الهاتف والواتساب',
      recommendations: generateRecommendations(diagnosis)
    });
  } catch (error) {
    console.error('Error diagnosing phone errors:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to diagnose phone errors' },
      { status: 500 }
    );
  }
}

function generateRecommendations(diagnosis: any) {
  const recommendations = [];
  
  if (diagnosis.phoneStats.hasError > 0) {
    recommendations.push(`يوجد ${diagnosis.phoneStats.hasError} خطأ في عمود رقم الهاتف يحتاج إصلاح`);
  }
  
  if (diagnosis.whatsappStats.hasError > 0) {
    recommendations.push(`يوجد ${diagnosis.whatsappStats.hasError} خطأ في عمود رقم الواتساب يحتاج إصلاح`);
  }
  
  if (diagnosis.phoneStats.problematic?.length > 0) {
    recommendations.push(`يوجد ${diagnosis.phoneStats.problematic.length} رقم هاتف يحتاج مراجعة`);
  }
  
  if (diagnosis.whatsappStats.problematic?.length > 0) {
    recommendations.push(`يوجد ${diagnosis.whatsappStats.problematic.length} رقم واتساب يحتاج مراجعة`);
  }
  
  if (diagnosis.summary.phoneColumn === 'غير موجود') {
    recommendations.push('عمود "رقم الهاتف" غير موجود في Google Sheets');
  }
  
  if (diagnosis.summary.whatsappColumn === 'غير موجود') {
    recommendations.push('عمود "رقم الواتس" غير موجود في Google Sheets');
  }
  
  if (recommendations.length === 0) {
    recommendations.push('جميع الأرقام تبدو صحيحة ✅');
  }
  
  return recommendations;
} 