import React from 'react';

interface IconProps extends React.SVGProps<SVGSVGElement> {
  className?: string;
}

/**
 * Resmi Google Play Store Renkli Vektörel Logosu (Official Google Play Brandmark)
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
 * Resmi Apple Logosu (Official Apple Inc. Brandmark - Simple Icons)
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
      <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
    </svg>
  );
}

/**
 * Resmi Apple App Store Connect Logosu (Apple Resmi 1024x1024 App Store Connect Varlığı)
 */
export function AppStoreConnectIcon({ className = 'w-4 h-4', ...props }: React.ImgHTMLAttributes<HTMLImageElement>) {
  return (
    <img
      src="/app-store-connect.png"
      alt="App Store Connect"
      className={`inline-block object-contain rounded-[22%] shadow-sm ${className}`}
      {...props}
    />
  );
}

/**
 * Resmi Apple App Store Vektörel Logosu (Official Apple App Store Mark)
 */
export function AppStoreIcon({ className = 'w-4 h-4', ...props }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path d="M8.8086 14.9194l6.1107-11.0368c.0837-.1513.1682-.302.2437-.4584.0685-.142.1267-.2854.1646-.4403.0803-.3259.0588-.6656-.066-.9767-.1238-.3095-.3417-.5678-.6201-.7355a1.4175 1.4175 0 0 0-.921-.1924c-.3207.043-.6135.1935-.8443.4288-.1094.1118-.1996.2361-.2832.369-.092.1463-.175.2979-.259.4492l-.3864.6979-.3865-.6979c-.0837-.1515-.1667-.303-.2587-.4492-.0837-.1329-.1739-.2572-.2835-.369-.2305-.2353-.5233-.3857-.844-.429a1.4181 1.4181 0 0 0-.921.1926c-.2784.1677-.4964.426-.6203.7355-.1246.311-.1461.6508-.066.9767.038.155.0962.2984.1648.4403.0753.1564.1598.307.2437.4584l1.248 2.2543-4.8625 8.7825H2.0295c-.1676 0-.3351-.0007-.5026.0092-.1522.009-.3004.0284-.448.0714-.3108.0906-.5822.2798-.7783.548-.195.2665-.3006.5929-.3006.9279 0 .3352.1057.6612.3006.9277.196.2683.4675.4575.7782.548.1477.043.296.0623.4481.0715.1675.01.335.009.5026.009h13.0974c.0171-.0357.059-.1294.1-.2697.415-1.4151-.6156-2.843-2.0347-2.843zM3.113 18.5418l-.7922 1.5008c-.0818.1553-.1644.31-.2384.4705-.067.1458-.124.293-.1611.452-.0785.3346-.0576.6834.0645 1.0029.1212.3175.3346.583.607.7549.2727.172.5891.2416.9013.1975.3139-.044.6005-.1986.8263-.4402.1072-.1148.1954-.2424.2772-.3787.0902-.1503.1714-.3059.2535-.4612L6 19.4636c-.0896-.149-.9473-1.4704-2.887-.9218m20.5861-3.0056a1.4707 1.4707 0 0 0-.779-.5407c-.1476-.0425-.2961-.0616-.4483-.0705-.1678-.0099-.3352-.0091-.503-.0091H18.648l-4.3891-7.817c-.6655.7005-.9632 1.485-1.0773 2.1976-.1655 1.0333.0367 2.0934.546 3.0004l5.2741 9.3933c.084.1494.167.299.2591.4435.0837.131.1739.2537.2836.364.231.2323.5238.3809.8449.4232.3192.0424.643-.0244.9217-.1899.2784-.1653.4968-.4204.621-.7257.1246-.3072.146-.6425.0658-.9641-.0381-.1529-.0962-.2945-.165-.4346-.0753-.1543-.1598-.303-.2438-.4524l-1.216-2.1662h1.596c.1677 0 .3351.0009.5029-.009.1522-.009.3007-.028.4483-.0705a1.4707 1.4707 0 0 0 .779-.5407A1.5386 1.5386 0 0 0 24 16.452a1.539 1.539 0 0 0-.3009-.9158Z" />
    </svg>
  );
}

/**
 * Flutter Projesinin Gerçek Uygulama İkonu (Bulunamazsa Baş Harf Gradient Avatar)
 */
export function ProjectAppIcon({
  path,
  name,
  className = 'w-9 h-9',
}: {
  path: string;
  name: string;
  className?: string;
}) {
  const [hasError, setHasError] = React.useState(false);

  React.useEffect(() => {
    setHasError(false);
  }, [path]);

  const initials = (name || 'App')
    .replace(/[^a-zA-Z0-9]/g, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('') || name.substring(0, 2).toUpperCase();

  if (hasError || !path) {
    return (
      <div
        className={`${className} rounded-xl bg-gradient-to-br from-primary/15 via-primary/25 to-primary/35 border border-primary/25 flex items-center justify-center font-bold text-xs text-primary shadow-sm shrink-0 select-none`}
      >
        {initials}
      </div>
    );
  }

  return (
    <img
      src={`/api/projects/icon?path=${encodeURIComponent(path)}`}
      alt={name}
      onError={() => setHasError(true)}
      className={`${className} rounded-xl object-cover border border-border/50 shadow-sm shrink-0 bg-background`}
      loading="lazy"
    />
  );
}
