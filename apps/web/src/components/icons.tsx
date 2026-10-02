import React from 'react';

interface IconProps extends React.SVGProps<SVGSVGElement> {
  className?: string;
}

/**
 * Resmi Google Play Store Renkli Vektörel Logosu
 */
export function GooglePlayIcon({ className = 'w-4 h-4', ...props }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path
        d="M3.609 1.814L13.793 12 3.61 22.186A2.22 2.22 0 0 1 3 20.615V3.385c0-.6.224-1.162.609-1.571z"
        fill="#00D2FF"
      />
      <path
        d="M17.18 8.613l-3.387 3.387 3.387 3.387 3.82-2.183c1.09-.623 1.09-1.637 0-2.26l-3.82-2.331z"
        fill="#FFCE00"
      />
      <path
        d="M3.609 1.814c.34-.361.819-.57 1.341-.57.433 0 .85.143 1.25.372l10.98 6.997-3.387 3.387L3.609 1.814z"
        fill="#00F076"
      />
      <path
        d="M13.793 12l3.387 3.387-10.98 6.997c-.4.229-.817.372-1.25.372-.522 0-1.001-.209-1.341-.57L13.793 12z"
        fill="#FF3A44"
      />
    </svg>
  );
}

/**
 * Resmi Apple Logosu
 */
export function AppleIcon({ className = 'w-4 h-4', ...props }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 4.54c.66-.8 1.1-1.92.98-3.04-.95.04-2.1.63-2.77 1.42-.59.68-1.11 1.82-.97 2.91 1.06.08 2.14-.54 2.76-1.29z" />
    </svg>
  );
}

/**
 * Resmi Apple App Store Logosu
 */
export function AppStoreIcon({ className = 'w-4 h-4', ...props }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <rect width="24" height="24" rx="5" fill="#0D96F6" />
      <path
        d="M15.82 14.63l1.92 3.29c.23.4.08.92-.32 1.15-.4.23-.92.08-1.15-.32l-1.68-2.88H9.41l-1.68 2.88c-.23.4-.75.55-1.15.32-.4-.23-.55-.75-.32-1.15l1.92-3.29H5.8c-.46 0-.84-.38-.84-.84s.38-.84.84-.84h2.95l2.25-3.86-1.08-1.85c-.23-.4-.08-.92.32-1.15.4-.23.92-.08 1.15.32l1.62 2.78 1.62-2.78c.23-.4.75-.55 1.15-.32.4.23.55.75.32 1.15l-1.08 1.85 2.25 3.86h2.95c.46 0 .84.38.84.84s-.38.84-.84.84h-2.38zm-3.82-3.05l-1.26 2.16h2.52l-1.26-2.16z"
        fill="#FFFFFF"
      />
    </svg>
  );
}
