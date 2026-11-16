/**
 * Player de reel do Instagram.
 *
 * Usamos o embed oficial (/reel/<code>/embed), que não exige token nem chave de
 * API — só o código do post. O iframe entra com loading="lazy" pra página não
 * baixar todos os vídeos de uma vez.
 */
export function ReelEmbed({
  shortcode,
  title,
  className = "",
}: {
  shortcode: string;
  title: string;
  className?: string;
}) {
  return (
    <div
      className={`relative w-full overflow-hidden bg-ink/80 ${className}`}
      style={{ aspectRatio: "9 / 15" }}
    >
      <iframe
        src={`https://www.instagram.com/reel/${shortcode}/embed`}
        title={title}
        loading="lazy"
        allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
        allowFullScreen
        scrolling="no"
        className="absolute inset-0 h-full w-full border-0"
      />
    </div>
  );
}
