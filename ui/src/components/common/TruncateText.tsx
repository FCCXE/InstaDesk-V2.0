// C:\FcXe Studios\Instadesk\instadesk-tauri\ui\src\components\common\TruncateText.tsx
import React from "react";

export default function TruncateText({
  children,
  title,
  className = "",
  maxWidthClass = "max-w-[320px]",
}: {
  children: React.ReactNode;
  title?: string;
  className?: string;
  /** Tailwind width class to control truncation width boundary */
  maxWidthClass?: string;
}) {
  const t = title ?? (typeof children === "string" ? (children as string) : undefined);
  return (
    <span
      title={t}
      className={[
        "block overflow-hidden text-ellipsis whitespace-nowrap",
        maxWidthClass,
        className,
      ].join(" ")}
    >
      {children}
    </span>
  );
}
