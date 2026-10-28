import Icon from '../ui/Icon.js';

/** Reputação de 0 a 5 com meias estrelas. */
export default function Stars({ value, size = 16 }) {
  return (
    <span className="stars" aria-label={`${value.toFixed(1)} de 5 estrelas`}>
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = Math.max(0, Math.min(1, value - i));
        return (
          <span key={i} className="star" style={{ width: size, height: size }}>
            <span className="star-bg"><Icon name="star" size={size} filled /></span>
            <span className="star-fg" style={{ width: `${fill * 100}%` }}><Icon name="star" size={size} filled /></span>
          </span>
        );
      })}
    </span>
  );
}
