import React from 'react';

interface RTLWrapperProps {
  children: React.ReactNode;
  className?: string;
}

const RTLWrapper: React.FC<RTLWrapperProps> = ({ children, className = '' }) => {
  return (
    <div className={`rtl ${className}`} dir="rtl">
      {children}
    </div>
  );
};

export default RTLWrapper; 