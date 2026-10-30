import React from "react";

import { useCardImage } from "@/hook/useCardImage";

/** <img> for card art through the shared, bounded card image cache. */
export const CardImg: React.FC<{
  code: number;
  back?: boolean;
  className?: string;
  alt?: string;
}> = ({ code, back = false, className, alt = "" }) => {
  const src = useCardImage(code, back);
  return <img className={className} src={src} alt={alt} decoding="async" />;
};
