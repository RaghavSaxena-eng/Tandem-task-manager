// Initials on a colour derived from the person's name, so the same person
// always looks the same across boards.
function hueFor(text = '') {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) % 360;
  return h;
}

export default function Avatar({ name = '?', size = 26 }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');
  return (
    <span
      className="avatar"
      title={name}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        background: `hsl(${hueFor(name)} 38% 88%)`,
        color: `hsl(${hueFor(name)} 45% 24%)`,
      }}
    >
      {initials}
    </span>
  );
}
