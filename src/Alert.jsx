import React from 'react';

const Alert = ({ children, variant = 'info' }) => {
  const baseStyles = "p-4 rounded-md mb-4";
  const variantStyles = {
    info: "bg-blue-100 text-blue-700",
    success: "bg-green-100 text-green-700",
    warning: "bg-yellow-100 text-yellow-700",
    error: "bg-red-100 text-red-700",
  };

  return (
    <div className={`${baseStyles} ${variantStyles[variant]}`}>
      {children}
    </div>
  );
};

const AlertTitle = ({ children }) => (
  <h3 className="text-lg font-medium mb-2">{children}</h3>
);

const AlertDescription = ({ children }) => (
  <div className="text-sm">{children}</div>
);

export { Alert, AlertTitle, AlertDescription };