const isLocalBrandPng = (src = "") => src.startsWith("/brand/") && src.endsWith(".png");
const optimizedWebp = (src) => src.replace("/brand/", "/brand/optimized/").replace(/\.png$/, ".webp");

export function OptimizedImage({ src, alt, width, height, loading = "lazy", decoding = "async", className = "", ...props }) {
  if (!isLocalBrandPng(src)) {
    return <img src={src} alt={alt} width={width} height={height} loading={loading} decoding={decoding} className={className} {...props} />;
  }

  return (
    <picture>
      <source srcSet={optimizedWebp(src)} type="image/webp" />
      <img src={src} alt={alt} width={width} height={height} loading={loading} decoding={decoding} className={className} {...props} />
    </picture>
  );
}
