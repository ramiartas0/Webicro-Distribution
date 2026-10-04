import React, { useState, useRef, useEffect } from 'react';

export type TooltipPosition = 'top' | 'bottom' | 'left' | 'right';

export interface TooltipProps {
  content?: React.ReactNode;
  children: React.ReactNode;
  position?: TooltipPosition;
  delay?: number;
  className?: string;
  disabled?: boolean;
}

export const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  position = 'top',
  delay = 150,
  className = '',
  disabled = false,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const showTooltip = () => {
    if (disabled || !content) return;
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true);
    }, delay);
  };

  const hideTooltip = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsVisible(false);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  if (!content || disabled) {
    return <>{children}</>;
  }

  let positionClasses = '';
  switch (position) {
    case 'top':
      positionClasses = 'bottom-full left-1/2 -translate-x-1/2 mb-1.5';
      break;
    case 'bottom':
      positionClasses = 'top-full left-1/2 -translate-x-1/2 mt-1.5';
      break;
    case 'left':
      positionClasses = 'right-full top-1/2 -translate-y-1/2 mr-1.5';
      break;
    case 'right':
      positionClasses = 'left-full top-1/2 -translate-y-1/2 ml-1.5';
      break;
  }

  return (
    <div
      className="relative inline-flex items-center group/tooltip"
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
      onFocus={showTooltip}
      onBlur={hideTooltip}
    >
      {children}
      {isVisible && (
        <div
          role="tooltip"
          className={`absolute ${positionClasses} z-50 pointer-events-none px-2.5 py-1 text-[11px] font-medium leading-tight rounded-md bg-primary text-primary-foreground shadow-md border border-border/40 whitespace-nowrap transition-all duration-150 animate-in fade-in zoom-in-95 ${className}`}
        >
          {content}
        </div>
      )}
    </div>
  );
};
