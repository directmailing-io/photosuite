import { initials } from "@/lib/utils";

type Props = {
  url?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  size?: number;
};

export function Avatar({ url, firstName, lastName, size = 36 }: Props) {
  if (url) {
    return (
      <img
        src={url}
        alt=""
        className="avatar object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, fontSize: size * 0.34 }}
    >
      {initials(firstName, lastName)}
    </span>
  );
}
