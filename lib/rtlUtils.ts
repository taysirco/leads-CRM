/**
 * Utility functions for RTL support
 */

// Convert LTR margin/padding classes to RTL equivalents
export const rtlClass = (className: string): string => {
  return className
    .replace(/\bml-(\w+)/g, 'mr-$1') // ml-* becomes mr-*
    .replace(/\bmr-(\w+)/g, 'ml-$1') // mr-* becomes ml-*
    .replace(/\bpl-(\w+)/g, 'pr-$1') // pl-* becomes pr-*
    .replace(/\bpr-(\w+)/g, 'pl-$1') // pr-* becomes pl-*
    .replace(/\bleft-(\w+)/g, 'right-$1') // left-* becomes right-*
    .replace(/\bright-(\w+)/g, 'left-$1') // right-* becomes left-*
    .replace(/\brounded-l-(\w+)/g, 'rounded-r-$1') // rounded-l-* becomes rounded-r-*
    .replace(/\brounded-r-(\w+)/g, 'rounded-l-$1') // rounded-r-* becomes rounded-l-*
    .replace(/\btext-left\b/g, 'text-right') // text-left becomes text-right
    .replace(/\btext-right\b/g, 'text-left') // text-right becomes text-left
    .replace(/\bfloat-left\b/g, 'float-right') // float-left becomes float-right
    .replace(/\bfloat-right\b/g, 'float-left'); // float-right becomes float-left
};

// Combine multiple class strings with RTL conversion
export const cn = (...classes: (string | undefined | null | false)[]): string => {
  return rtlClass(classes.filter(Boolean).join(' '));
};

// Check if a string contains Arabic characters
export const isArabic = (text: string): boolean => {
  const arabicRegex = /[\u0600-\u06FF\u0750-\u077F]/;
  return arabicRegex.test(text);
};

// Auto-detect text direction based on content
export const getTextDirection = (text: string): 'rtl' | 'ltr' => {
  return isArabic(text) ? 'rtl' : 'ltr';
};

// Smart text alignment based on content
export const getTextAlign = (text: string): string => {
  return isArabic(text) ? 'text-right' : 'text-left';
}; 