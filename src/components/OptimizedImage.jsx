const isLocalBrandPng = (src = "") => src.startsWith("/brand/") && src.endsWith(".png");
const optimized = (src, ext) => src.replace("/brand/", "/brand/optimized/").replace(/\.png$/, `.${ext}`);

export function OptimizedImage({ src, alt, width, height, loading = "lazy", decoding = "async", className = "", ...props }) {
  if (!isLocalBrandPng(src)) {
    return <img src={src} alt={alt} width={width} height={height} loading={loading} decoding={decoding} className={className} {...props} />;
  }

  return (
    <picture>
      <source srcSet={optimized(src, "avif")} type="image/avif" />
      <source srcSet={optimized(src, "webp")} type="image/webp" />
      <img src={src} alt={alt} width={width} height={height} loading={loading} decoding={decoding} className={className} {...props} />
    </picture>
  );
}
