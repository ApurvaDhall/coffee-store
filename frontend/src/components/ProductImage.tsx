import { useEffect, useState } from "react";

export type ProductImageProps = {
  src: string | null | undefined;
  name: string;
  className?: string;
  width?: number;
  height?: number;
  eager?: boolean;
};

export default function ProductImage({
  src,
  name,
  className,
  width = 600,
  height = 450,
  eager = false
}: ProductImageProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src?.trim() || failed) {
    return (
      <div
        className={className ? `image-placeholder ${className}` : "image-placeholder"}
        style={{ width, height }}
        role="img"
        aria-label={`${name} image unavailable`}
      >
        <span aria-hidden="true">☕</span>
        <span>{name}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={`${name} coffee`}
      width={width}
      height={height}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      className={className}
      onError={() => setFailed(true)}
    />
  );
}
